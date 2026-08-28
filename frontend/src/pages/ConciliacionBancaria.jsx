import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Scale, Search, CheckSquare, Square, RefreshCw, UploadCloud, 
    FileSpreadsheet, FileText, Eye, Edit2, CheckCircle2, 
    AlertCircle, ArrowRightLeft, Sparkles, Filter, X, ShieldAlert,
    Calendar, Building2, Landmark, DollarSign, Check, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { socket } from '../services/socket';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';

export default function ConciliacionBancaria() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const canEditMonto = user.role_id === 1 || user.permissions?.includes('edit_monto_conciliacion');

    // Catálogos y Filtros
    const [empresas, setEmpresas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [selectedCuentaId, setSelectedCuentaId] = useState('');
    
    // Fechas y Selector de Periodo
    const [periodoPreset, setPeriodoPreset] = useState('este_mes');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const [desde, setDesde] = useState(firstDay);
    const [hasta, setHasta] = useState(todayStr);

    const handlePeriodoPresetChange = (preset) => {
        setPeriodoPreset(preset);
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();

        const pad = (n) => String(n).padStart(2, '0');
        const toYMD = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

        if (preset === 'hoy') {
            const t = toYMD(now);
            setDesde(t);
            setHasta(t);
        } else if (preset === 'ayer') {
            const yesterday = new Date(y, m, d - 1);
            const yStr = toYMD(yesterday);
            setDesde(yStr);
            setHasta(yStr);
        } else if (preset === 'este_mes') {
            const startOfMonth = toYMD(new Date(y, m, 1));
            const t = toYMD(now);
            setDesde(startOfMonth);
            setHasta(t);
        } else if (preset === 'mes_anterior') {
            const startOfPrevMonth = toYMD(new Date(y, m - 1, 1));
            const endOfPrevMonth = toYMD(new Date(y, m, 0));
            setDesde(startOfPrevMonth);
            setHasta(endOfPrevMonth);
        } else if (preset === 'ultimos_30_dias') {
            const past30 = toYMD(new Date(y, m, d - 30));
            const t = toYMD(now);
            setDesde(past30);
            setHasta(t);
        } else if (preset === 'ultimos_3_meses') {
            const past3m = toYMD(new Date(y, m - 3, d));
            const t = toYMD(now);
            setDesde(past3m);
            setHasta(t);
        } else if (preset === 'anio_actual') {
            const startOfYear = toYMD(new Date(y, 0, 1));
            const t = toYMD(now);
            setDesde(startOfYear);
            setHasta(t);
        }
    };

    // Estado principal
    const [loading, setLoading] = useState(false);
    const [cuentaInfo, setCuentaInfo] = useState(null);
    const [movimientosConciliados, setMovimientosConciliados] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [resumen, setResumen] = useState({
        saldo_banco: 0,
        saldo_chequera: 0,
        diferencia: 0,
        ultima_validacion: null
    });

    // Saldo en Banco editable para simulación y procesamiento
    const [saldoBancoManual, setSaldoBancoManual] = useState('');

    // Tabs: 'MOVIMIENTOS' | 'PENDIENTES'
    const [activeTab, setActiveTab] = useState('MOVIMIENTOS');
    const [searchTerm, setSearchTerm] = useState('');

    // Selección múltiple para aplicar en pendientes
    const [selectedPendingKeys, setSelectedPendingKeys] = useState(new Set());
    const [fechaAplicadoInput, setFechaAplicadoInput] = useState(todayStr);

    // Modales
    const [showImportModal, setShowImportModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);

    // Item seleccionado para detalle/edición
    const [selectedItem, setSelectedItem] = useState(null);
    const [editFormData, setEditFormData] = useState({
        documento: '',
        concepto: '',
        fecha: '',
        monto: 0
    });

    // Estado para Importador de Extractos
    const [importBank, setImportBank] = useState('AUTO');
    const [importRawText, setImportRawText] = useState('');
    const [parsedExtract, setParsedExtract] = useState(null);
    const [isParsing, setIsParsing] = useState(false);

    // Cargar catálogos iniciales
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const res = await api.get('/bancos/conciliacion/catalogos');
                setEmpresas(res.data.empresas || []);
                setCuentas(res.data.cuentas || []);
                if (res.data.cuentas?.length > 0) {
                    setSelectedCuentaId(String(res.data.cuentas[0].id));
                    setSelectedEmpresa(String(res.data.cuentas[0].empresa_codigo || ''));
                }
            } catch (err) {
                console.error(err);
                addToast('Error al cargar catálogos de bancos', 'error');
            }
        };
        fetchCatalogos();
    }, [addToast]);

    // Filtrar cuentas por empresa seleccionada
    const cuentasFiltradas = useMemo(() => {
        if (!selectedEmpresa) return cuentas;
        return cuentas.filter(c => String(c.empresa_codigo) === String(selectedEmpresa));
    }, [cuentas, selectedEmpresa]);

    // Sincronizar cuenta seleccionada cuando cambia el filtro de empresa
    useEffect(() => {
        if (cuentasFiltradas.length > 0) {
            const exists = cuentasFiltradas.some(c => String(c.id) === String(selectedCuentaId));
            if (!exists) {
                setSelectedCuentaId(String(cuentasFiltradas[0].id));
            }
        } else if (cuentas.length > 0 && selectedEmpresa) {
            setSelectedCuentaId('');
            setCuentaInfo(null);
            setMovimientosConciliados([]);
            setPendientes([]);
        }
    }, [cuentasFiltradas, selectedCuentaId, cuentas.length, selectedEmpresa]);

    // Cargar datos de conciliación
    const fetchData = useCallback(async () => {
        if (!selectedCuentaId) return;
        setLoading(true);
        try {
            const res = await api.get('/bancos/conciliacion/data', {
                params: {
                    cuenta_id: selectedCuentaId,
                    desde: desde || undefined,
                    hasta: hasta || undefined
                }
            });
            setCuentaInfo(res.data.cuenta || null);
            setMovimientosConciliados(res.data.movimientos_conciliados || []);
            setPendientes(res.data.pendientes || []);
            setResumen(res.data.resumen || { saldo_banco: 0, saldo_chequera: 0, diferencia: 0, ultima_validacion: null });
            setSaldoBancoManual(res.data.resumen?.saldo_banco !== undefined ? String(res.data.resumen.saldo_banco) : '0');
            setSelectedPendingKeys(new Set());
        } catch (err) {
            console.error('Error al consultar conciliación:', err);
            const msg = err.response?.data?.message || 'Error al consultar conciliación bancaria';
            addToast(msg, 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedCuentaId, desde, hasta, addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Escuchar eventos en tiempo real de Socket.io
    useEffect(() => {
        const handleUpdate = () => {
            fetchData();
        };
        socket.on('conciliacion_updated', handleUpdate);
        return () => {
            socket.off('conciliacion_updated', handleUpdate);
        };
    }, [fetchData]);

    // Cambiar empresa
    const handleEmpresaChange = (e) => {
        const empCode = e.target.value;
        setSelectedEmpresa(empCode);
        const filtered = cuentas.filter(c => !empCode || String(c.empresa_codigo) === String(empCode));
        if (filtered.length > 0) {
            setSelectedCuentaId(String(filtered[0].id));
        } else {
            setSelectedCuentaId('');
        }
    };

    // Filtro de búsqueda en tabla
    const filteredMovimientos = useMemo(() => {
        if (!searchTerm) return movimientosConciliados;
        const q = searchTerm.toLowerCase();
        return movimientosConciliados.filter(item => 
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.fecha_aplicado_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [movimientosConciliados, searchTerm]);

    const filteredPendientes = useMemo(() => {
        if (!searchTerm) return pendientes;
        const q = searchTerm.toLowerCase();
        return pendientes.filter(item => 
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [pendientes, searchTerm]);

    // Selección de pendientes
    const handleTogglePending = (key) => {
        const next = new Set(selectedPendingKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelectedPendingKeys(next);
    };

    const handleSelectAllPending = () => {
        if (selectedPendingKeys.size === filteredPendientes.length) {
            setSelectedPendingKeys(new Set());
        } else {
            setSelectedPendingKeys(new Set(filteredPendientes.map(p => p.key)));
        }
    };

    // Acción: Conciliar Pendientes Seleccionados
    const handleConciliarSeleccionados = async () => {
        if (selectedPendingKeys.size === 0) {
            addToast('Selecciona al menos un documento pendiente', 'warning');
            return;
        }

        const itemsToApply = pendientes
            .filter(p => selectedPendingKeys.has(p.key))
            .map(p => ({ id: p.id, origen_tipo: p.origen_tipo }));

        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                items: itemsToApply,
                fecha_aplicado: fechaAplicadoInput,
                accion: 'CONCILIAR'
            });
            addToast(res.data.message || 'Documentos conciliados con éxito', 'success');
            setSelectedPendingKeys(new Set());
            fetchData();
        } catch (err) {
            console.error(err);
            addToast('Error al conciliar documentos', 'error');
        }
    };

    // Acción: Desconciliar (eliminar fecha aplicado)
    const handleDesconciliar = async (item) => {
        const ok = await confirm(
            `¿Estás seguro de desconciliar el documento "${item.documento || item.concepto}"? Volverá a estar pendiente.`,
            { variant: 'danger' }
        );
        if (!ok) return;

        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                items: [{ id: item.id, origen_tipo: item.origen_tipo }],
                accion: 'DESCONCILIAR'
            });
            addToast(res.data.message || 'Documento desconciliado', 'success');
            fetchData();
        } catch (err) {
            console.error(err);
            addToast('Error al desconciliar', 'error');
        }
    };

    // Guardar validación de saldo
    const handleGuardarValidacion = async () => {
        const montoNum = parseFloat(saldoBancoManual) || 0;
        const saldoCheq = Number(resumen.saldo_chequera || 0);
        const dif = Number((montoNum - saldoCheq).toFixed(2));

        try {
            await api.post('/bancos/conciliacion/validar-saldo', {
                cuenta_bancaria_id: selectedCuentaId,
                monto_banco: montoNum,
                saldo_chequera: saldoCheq,
                diferencia: dif,
                notas: `Validación conciliación al ${hasta}`
            });
            addToast('Validación de saldo registrada correctamente', 'success');
            setShowValidationModal(false);
            fetchData();
        } catch (err) {
            console.error(err);
            addToast('Error al guardar validación de saldo', 'error');
        }
    };

    // Parsear Extracto Bancario
    const handleParseExtracto = async () => {
        if (!importRawText.trim()) {
            addToast('Ingresa o pega los datos del estado de cuenta', 'warning');
            return;
        }
        setIsParsing(true);
        try {
            const res = await api.post('/bancos/conciliacion/parse-extracto', {
                cuenta_id: selectedCuentaId,
                raw_data: importRawText,
                banco_formato: importBank
            });
            setParsedExtract(res.data);
            addToast(`Se procesaron ${res.data.total_procesadas} líneas del extracto`, 'success');
        } catch (err) {
            console.error(err);
            addToast('Error al procesar extracto bancario', 'error');
        } finally {
            setIsParsing(false);
        }
    };

    // Cargar archivo Excel/CSV para el extracto
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const firstSheetName = wb.SheetNames[0];
                const ws = wb.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                
                // Convertir matriz a texto separado por tabuladores para el parser
                const text = data.map(row => row.join('\t')).join('\n');
                setImportRawText(text);
                addToast(`Archivo cargado: ${file.name}`, 'info');
            } catch (err) {
                console.error(err);
                addToast('Error al leer archivo Excel', 'error');
            }
        };
        reader.readAsBinaryString(file);
    };

    // Conciliar automáticamente las coincidencias del extracto
    const handleConciliarMatchesExtracto = async () => {
        if (!parsedExtract || !parsedExtract.transacciones) return;
        const matches = parsedExtract.transacciones
            .filter(t => t.match && t.match.id)
            .map(t => ({ id: t.match.id, origen_tipo: t.match.origen_tipo }));

        if (matches.length === 0) {
            addToast('No hay coincidencias automáticas para conciliar', 'warning');
            return;
        }

        const ok = await confirm(`¿Deseas conciliar automáticamente las ${matches.length} coincidencias encontradas?`);
        if (!ok) return;

        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                items: matches,
                fecha_aplicado: fechaAplicadoInput,
                accion: 'CONCILIAR'
            });
            addToast(res.data.message || 'Coincidencias conciliadas exitosamente', 'success');
            setShowImportModal(false);
            setParsedExtract(null);
            setImportRawText('');
            fetchData();
        } catch (err) {
            console.error(err);
            addToast('Error al conciliar coincidencias', 'error');
        }
    };

    // Abrir modal de edición
    const handleOpenEdit = (item) => {
        setSelectedItem(item);
        setEditFormData({
            documento: item.documento || '',
            concepto: item.concepto || '',
            fecha: item.fecha ? String(item.fecha).split('T')[0] : '',
            monto: item.monto_display || item.monto || 0
        });
        setShowEditModal(true);
    };

    // Guardar edición
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!selectedItem) return;
        try {
            await api.put(`/bancos/conciliacion/movimiento/${selectedItem.id}`, {
                ...editFormData,
                origen_tipo: selectedItem.origen_tipo
            });
            addToast('Registro actualizado exitosamente', 'success');
            setShowEditModal(false);
            fetchData();
        } catch (err) {
            console.error(err);
            addToast(err.response?.data?.message || 'Error al actualizar', 'error');
        }
    };

    // Exportar a Excel
    const exportToExcel = () => {
        const dataToExport = activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes;
        if (dataToExport.length === 0) return;

        const formatted = dataToExport.map(r => ({
            'Fecha': r.fecha_display || '',
            'Tipo': r.tipo || '',
            'Documento': r.documento || '',
            'Concepto': r.concepto || '',
            'Beneficiario': r.beneficiario || '',
            'Monto': Number(r.monto_display || 0),
            'Fecha Aplicado': r.fecha_aplicado_display || (activeTab === 'MOVIMIENTOS' ? 'Sí' : 'Pendiente')
        }));

        const ws = XLSX.utils.json_to_sheet(formatted);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab);
        const cuentaNom = cuentaInfo ? `${cuentaInfo.banco_nombre}_${cuentaInfo.numero}` : 'Conciliacion';
        XLSX.writeFile(wb, `Conciliacion_${cuentaNom}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Exportar a PDF
    const exportToPDF = () => {
        const dataToExport = activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes;
        if (dataToExport.length === 0) return;

        const doc = new jsPDF('landscape');
        const title = `Conciliación Bancaria - ${activeTab === 'MOVIMIENTOS' ? 'Movimientos Aplicados' : 'Documentos Pendientes'}`;
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        
        doc.setFontSize(9);
        const sub = `Cuenta: ${cuentaInfo?.banco_nombre || ''} - ${cuentaInfo?.numero || ''} | Periodo: ${desde} al ${hasta} | Saldo Chequera: $${Number(resumen.saldo_chequera || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        doc.text(sub, 14, 22);

        const tableColumn = ['FECHA', 'TIPO', 'DOCUMENTO', 'CONCEPTO', 'BENEFICIARIO', 'MONTO', 'APLICADO'];
        const tableRows = dataToExport.map(r => [
            r.fecha_display || '',
            r.tipo || '',
            r.documento || '',
            r.concepto || '',
            r.beneficiario || '',
            `$${Number(r.monto_display || 0).toFixed(2)}`,
            r.fecha_aplicado_display || '-'
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        doc.save(`Conciliacion_${activeTab}_${hasta}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    // Render de Badges por tipo de movimiento
    const renderTipoBadge = (tipo) => {
        let color = '#3b82f6';
        let bg = 'rgba(59, 130, 246, 0.15)';
        if (tipo === 'CH') { color = '#ef4444'; bg = 'rgba(239, 68, 68, 0.15)'; } // Cheque
        else if (tipo === 'RM') { color = '#10b981'; bg = 'rgba(16, 185, 129, 0.15)'; } // Remesa
        else if (tipo === 'NC') { color = '#f59e0b'; bg = 'rgba(245, 158, 11, 0.15)'; } // Nota Cargo
        else if (tipo === 'NA') { color = '#8b5cf6'; bg = 'rgba(139, 92, 246, 0.15)'; } // Nota Abono

        return (
            <span style={{
                color,
                background: bg,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: '600',
                fontSize: '0.75rem',
                display: 'inline-block'
            }}>
                {tipo || 'MOV'}
            </span>
        );
    };

    // Cálculos dinámicos de saldo
    const saldoBancoActual = parseFloat(saldoBancoManual) || 0;
    const saldoChequeraActual = Number(resumen.saldo_chequera || 0);
    const diferenciaActual = Number((saldoBancoActual - saldoChequeraActual).toFixed(2));
    const esDiferenciaCero = Math.abs(diferenciaActual) < 0.009;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* 1. Header & Filtros */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '8px', color: 'var(--primary)' }}>
                        <Scale size={26} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Conciliación Bancaria</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Conciliación de cuentas, control de saldos y cruce de extractos bancarios.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button 
                        onClick={() => setShowImportModal(true)} 
                        className="btn-primary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <UploadCloud size={17} /> Importar Extracto
                    </button>
                    <button 
                        onClick={exportToExcel} 
                        className="btn-secondary" 
                        title="Exportar a Excel"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button 
                        onClick={exportToPDF} 
                        className="btn-secondary" 
                        title="Exportar a PDF"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileText size={16} /> PDF
                    </button>
                    <button 
                        onClick={fetchData} 
                        disabled={loading} 
                        className="btn-secondary" 
                        title="Recargar datos"
                        style={{ padding: '0.6rem' }}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* 2. Barra de Filtros de Cuenta y Periodo */}
            <div className="card glass" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    
                    {/* Empresa / Contribuyente */}
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Building2 size={14} /> Contribuyente / Empresa:
                        </label>
                        <select 
                            value={selectedEmpresa} 
                            onChange={handleEmpresaChange}
                            style={{ width: '100%', height: '38px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem' }}
                        >
                            <option value="">-- Todas las Empresas --</option>
                            {empresas.map(e => (
                                <option key={e.codigo || e.id} value={e.codigo}>{e.nombre}</option>
                            ))}
                        </select>
                    </div>

                    {/* Cuenta Bancaria */}
                    <div style={{ flex: '2 1 320px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Landmark size={14} /> Cuenta Bancaria:
                        </label>
                        <select 
                            value={selectedCuentaId} 
                            onChange={(e) => setSelectedCuentaId(e.target.value)}
                            style={{ width: '100%', height: '38px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontWeight: '500' }}
                        >
                            {cuentasFiltradas.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.banco_nombre || 'BANCO'} - {c.numero} - {c.nombre} ({c.empresa_codigo})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Selector de Periodo Rápido */}
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Clock size={14} /> Periodo:
                        </label>
                        <select
                            value={periodoPreset}
                            onChange={(e) => handlePeriodoPresetChange(e.target.value)}
                            style={{ width: '100%', height: '38px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontWeight: '500' }}
                        >
                            <option value="este_mes">Este Mes (Actual)</option>
                            <option value="ultimos_30_dias">Últimos 30 Días</option>
                            <option value="ultimos_3_meses">Últimos 3 Meses</option>
                            <option value="mes_anterior">Mes Anterior</option>
                            <option value="hoy">Hoy</option>
                            <option value="ayer">Ayer</option>
                            <option value="anio_actual">Año Actual</option>
                            <option value="custom">Personalizado</option>
                        </select>
                    </div>

                    {/* Rango de Fechas */}
                    <div style={{ flex: '1 1 140px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Calendar size={14} /> Desde:
                        </label>
                        <input 
                            type="date" 
                            value={desde} 
                            onChange={e => { setDesde(e.target.value); setPeriodoPreset('custom'); }} 
                            style={{ width: '100%', height: '38px' }} 
                        />
                    </div>

                    <div style={{ flex: '1 1 140px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Calendar size={14} /> Hasta:
                        </label>
                        <input 
                            type="date" 
                            value={hasta} 
                            onChange={e => { setHasta(e.target.value); setPeriodoPreset('custom'); }} 
                            style={{ width: '100%', height: '38px' }} 
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button 
                            onClick={fetchData} 
                            className="btn-primary" 
                            style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Filter size={16} /> Filtrar
                        </button>
                    </div>
                </div>
            </div>

            {/* 3. Banner Superior: ÚLTIMA VALIDACIÓN */}
            <div style={{
                background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                padding: '0.65rem 1.25rem',
                borderRadius: 'var(--border-radius)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                fontWeight: '700',
                letterSpacing: '0.5px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <AlertCircle size={20} />
                    <span>
                        {resumen.ultima_validacion ? (
                            <>
                                ÚLTIMA VALIDACIÓN: {new Date(resumen.ultima_validacion.fecha_validacion).toLocaleDateString('es-ES')} {new Date(resumen.ultima_validacion.fecha_validacion).toLocaleTimeString('es-ES')}
                            </>
                        ) : (
                            'ÚLTIMA VALIDACIÓN: SIN REGISTRO PREVIO'
                        )}
                    </span>
                </div>
                <div style={{ fontSize: '1.05rem', background: 'rgba(0,0,0,0.25)', padding: '0.2rem 0.8rem', borderRadius: '4px' }}>
                    MONTO: ${Number(resumen.ultima_validacion?.monto_banco || resumen.saldo_banco || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* 4. Selector de Pestañas & Búsqueda */}
            <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        onClick={() => { setActiveTab('MOVIMIENTOS'); setSelectedPendingKeys(new Set()); }}
                        className={activeTab === 'MOVIMIENTOS' ? 'btn-primary' : 'btn-secondary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', fontWeight: '600' }}
                    >
                        <CheckCircle2 size={16} /> MOVIMIENTOS ({filteredMovimientos.length})
                    </button>

                    <button 
                        onClick={() => { setActiveTab('PENDIENTES'); }}
                        className={activeTab === 'PENDIENTES' ? 'btn-primary' : 'btn-secondary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.2rem', fontWeight: '600' }}
                    >
                        <ArrowRightLeft size={16} /> PENDIENTES ({filteredPendientes.length})
                    </button>
                </div>

                {/* Buscador & Controles rápidos */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', minWidth: '240px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar en la tabla..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', height: '36px', paddingLeft: '32px', fontSize: '0.85rem' }} 
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', color: 'var(--text-muted)' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {activeTab === 'PENDIENTES' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fecha Aplicado:</span>
                            <input 
                                type="date" 
                                value={fechaAplicadoInput} 
                                onChange={e => setFechaAplicadoInput(e.target.value)} 
                                style={{ height: '32px', fontSize: '0.85rem' }} 
                            />
                            <button 
                                onClick={handleConciliarSeleccionados}
                                disabled={selectedPendingKeys.size === 0}
                                className="btn-primary"
                                style={{ height: '32px', padding: '0 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Check size={14} /> CONCILIAR ({selectedPendingKeys.size})
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 5. Tabla de Datos */}
            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ minWidth: '950px', width: '100%', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {activeTab === 'PENDIENTES' && (
                                <th style={{ width: '40px', textAlign: 'center', padding: '0.75rem 0.5rem' }}>
                                    <button 
                                        onClick={handleSelectAllPending} 
                                        style={{ background: 'none', color: 'var(--primary)', padding: 0 }}
                                        title="Seleccionar / Deseleccionar todos"
                                    >
                                        {selectedPendingKeys.size > 0 && selectedPendingKeys.size === filteredPendientes.length ? (
                                            <CheckSquare size={18} />
                                        ) : (
                                            <Square size={18} />
                                        )}
                                    </button>
                                </th>
                            )}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>FECHA</th>
                            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>TIPO</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>DOCUMENTO</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>CONCEPTO</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>BENEFICIARIO</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>MONTO</th>
                            {activeTab === 'MOVIMIENTOS' && (
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>APLICADO</th>
                            )}
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={activeTab === 'PENDIENTES' ? 8 : 8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                                    Cargando registros de conciliación...
                                </td>
                            </tr>
                        ) : (activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes).length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'PENDIENTES' ? 8 : 8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    No se encontraron {activeTab === 'MOVIMIENTOS' ? 'movimientos conciliados' : 'documentos pendientes'} en el periodo seleccionado.
                                </td>
                            </tr>
                        ) : (
                            (activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes).map((row, idx) => {
                                const isSelected = selectedPendingKeys.has(row.key);
                                return (
                                    <tr 
                                        key={row.key || idx} 
                                        style={{ 
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            background: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                                            transition: 'background 0.15s'
                                        }}
                                    >
                                        {activeTab === 'PENDIENTES' && (
                                            <td style={{ textAlign: 'center', padding: '0.6rem 0.5rem' }}>
                                                <button 
                                                    onClick={() => handleTogglePending(row.key)}
                                                    style={{ background: 'none', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', padding: 0 }}
                                                >
                                                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </button>
                                            </td>
                                        )}
                                        <td style={{ padding: '0.6rem 1rem', fontWeight: '500' }}>
                                            {row.fecha_display || '-'}
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                            {renderTipoBadge(row.tipo)}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', fontWeight: '600' }}>
                                            {row.documento || '-'}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.concepto}>
                                            {row.concepto || '-'}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)' }} title={row.beneficiario}>
                                            {row.beneficiario || '-'}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '700', color: row.origen_tipo === 'CK' || row.cargo > 0 ? '#ef4444' : '#10b981' }}>
                                            ${Number(row.monto_display || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        {activeTab === 'MOVIMIENTOS' && (
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#10b981', fontWeight: '500' }}>
                                                {row.fecha_aplicado_display || '-'}
                                            </td>
                                        )}
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                <button 
                                                    onClick={() => { setSelectedItem(row); setShowDetailModal(true); }}
                                                    className="icon-btn"
                                                    title="Ver detalle del documento"
                                                    style={{ padding: '4px' }}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleOpenEdit(row)}
                                                    className="icon-btn"
                                                    title="Editar documento / concepto"
                                                    style={{ padding: '4px' }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                {activeTab === 'MOVIMIENTOS' ? (
                                                    <button 
                                                        onClick={() => handleDesconciliar(row)}
                                                        className="icon-btn"
                                                        title="Desconciliar documento (F4)"
                                                        style={{ padding: '4px', color: '#ef4444' }}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={async () => {
                                                            await api.post('/bancos/conciliacion/aplicar', {
                                                                items: [{ id: row.id, origen_tipo: row.origen_tipo }],
                                                                fecha_aplicado: fechaAplicadoInput,
                                                                accion: 'CONCILIAR'
                                                            });
                                                            addToast('Documento conciliado', 'success');
                                                            fetchData();
                                                        }}
                                                        className="icon-btn"
                                                        title="Conciliar individualmente"
                                                        style={{ padding: '4px', color: '#10b981' }}
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 6. Barra Inferior de Totales y Conciliación (Diseño idéntico a las referencias) */}
            <div className="card glass" style={{ 
                padding: '1.25rem', 
                border: '1px solid rgba(255,255,255,0.15)', 
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                    
                    {/* Bloque de Saldos */}
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        
                        {/* Saldo en Banco */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '0.5px' }}>*SALDO EN BANCO</span>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>$</span>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={saldoBancoManual} 
                                    onChange={e => setSaldoBancoManual(e.target.value)}
                                    style={{ 
                                        width: '150px', 
                                        height: '40px', 
                                        paddingLeft: '24px', 
                                        fontWeight: '700', 
                                        fontSize: '1.05rem', 
                                        textAlign: 'right',
                                        background: 'rgba(0,0,0,0.25)',
                                        border: '2px solid rgba(59, 130, 246, 0.4)'
                                    }} 
                                />
                            </div>
                        </div>

                        {/* Saldo en Chequera */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '0.5px' }}>SALDO EN CHEQUERA</span>
                            <div style={{ 
                                minWidth: '150px', 
                                height: '40px', 
                                padding: '0 1rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end', 
                                fontWeight: '700', 
                                fontSize: '1.05rem', 
                                background: 'rgba(0,0,0,0.25)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--border-radius)'
                            }}>
                                ${saldoChequeraActual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {/* Diferencia DIF */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '0.5px' }}>DIF</span>
                            <div style={{ 
                                minWidth: '130px', 
                                height: '40px', 
                                padding: '0 1rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end', 
                                fontWeight: '800', 
                                fontSize: '1.05rem', 
                                background: esDiferenciaCero ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                border: `2px solid ${esDiferenciaCero ? '#10b981' : '#ef4444'}`,
                                color: esDiferenciaCero ? '#10b981' : '#ef4444',
                                borderRadius: 'var(--border-radius)'
                            }}>
                                ${diferenciaActual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {esDiferenciaCero && (
                                <span title="¡Conciliado perfectamente!" style={{ color: '#10b981' }}>
                                    <CheckCircle2 size={24} />
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => setShowValidationModal(true)}
                            className="btn-primary" 
                            style={{ 
                                height: '42px', 
                                padding: '0 1.5rem', 
                                fontWeight: '700', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5rem',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                            }}
                        >
                            <CheckSquare size={18} /> PROCESAR Y GUARDAR
                        </button>
                    </div>
                </div>
            </div>

            {/* ── MODAL 1: IMPORTADOR DE EXTRACTO BANCARIO ── */}
            <Modal
                open={showImportModal}
                onClose={() => { setShowImportModal(false); setParsedExtract(null); }}
                title="Importar Extracto Bancario Multibanco"
                size="xl"
                footer={(
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div>
                            {parsedExtract && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Total procesadas: <strong>{parsedExtract.total_procesadas}</strong> | Coincidencias automáticas: <strong>{parsedExtract.transacciones.filter(t => t.match).length}</strong>
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button onClick={() => { setShowImportModal(false); setParsedExtract(null); }} className="btn-secondary">
                                Cerrar
                            </button>
                            {parsedExtract && (
                                <button 
                                    onClick={handleConciliarMatchesExtracto}
                                    className="btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Sparkles size={16} /> Conciliar Coincidencias
                                </button>
                            )}
                        </div>
                    </div>
                )}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Selector de Banco & Carga de Archivo */}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Formato del Banco:</label>
                            <select 
                                value={importBank} 
                                onChange={e => setImportBank(e.target.value)}
                                style={{ width: '100%', height: '38px' }}
                            >
                                <option value="AUTO">-- Auto Detección Inteligente --</option>
                                <option value="PROMERICA">Banco Promerica</option>
                                <option value="BAC">BAC Credomatic</option>
                                <option value="DAVIVIENDA">Banco Davivienda</option>
                                <option value="HIPOTECARIO">Banco Hipotecario</option>
                                <option value="CUSCATLAN">Banco Cuscatlán</option>
                                <option value="AGRICOLA">Banco Agrícola</option>
                                <option value="ATLANTIDA">Banco Atlántida</option>
                                <option value="ABANK">Banco Abank / Constelación</option>
                            </select>
                        </div>

                        <div style={{ flex: '1 1 250px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Cargar Archivo Excel / CSV:</label>
                            <input 
                                type="file" 
                                accept=".xlsx, .xls, .csv" 
                                onChange={handleFileUpload}
                                style={{ width: '100%', fontSize: '0.85rem' }} 
                            />
                        </div>

                        <div style={{ alignSelf: 'flex-end' }}>
                            <button 
                                onClick={handleParseExtracto}
                                disabled={isParsing || !importRawText.trim()}
                                className="btn-primary"
                                style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {isParsing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                Analizar Extracto
                            </button>
                        </div>
                    </div>

                    {/* Área de Pegado (Ctrl + V) */}
                    <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>
                            O pega directamente aquí las filas copiadas de tu Excel o Banca en Línea:
                        </label>
                        <textarea 
                            rows={4}
                            placeholder="Pega aquí las filas copiadas (Ctrl+V)... Ejemplo: 28/08/2026   10004567   LIQUIDACION PROMERICA   $250.00"
                            value={importRawText}
                            onChange={e => setImportRawText(e.target.value)}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.5rem' }}
                        />
                    </div>

                    {/* Resultados del Cruce / Análisis */}
                    {parsedExtract && parsedExtract.transacciones && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Sparkles size={16} color="var(--primary)" />
                                Previsualización de Movimientos del Extracto y Cruce con Pendientes:
                            </h3>
                            <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <table style={{ minWidth: '850px', width: '100%', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '6px' }}>FECHA</th>
                                            <th style={{ padding: '6px' }}>DOC</th>
                                            <th style={{ padding: '6px' }}>DESCRIPCIÓN EXTRACTO</th>
                                            <th style={{ padding: '6px', textAlign: 'right' }}>MONTO</th>
                                            <th style={{ padding: '6px' }}>CONCEPTO SUGERIDO</th>
                                            <th style={{ padding: '6px' }}>ESTADO DE CRUCE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedExtract.transacciones.map((t, idx) => {
                                            const hasMatch = Boolean(t.match);
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: hasMatch ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                                                    <td style={{ padding: '6px' }}>{t.fecha}</td>
                                                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>{t.documento || '-'}</td>
                                                    <td style={{ padding: '6px' }}>{t.descripcion}</td>
                                                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                                                        ${Number(t.monto).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '6px', color: 'var(--primary)' }}>
                                                        {t.conceptoSugerido || '-'}
                                                    </td>
                                                    <td style={{ padding: '6px' }}>
                                                        {hasMatch ? (
                                                            <span style={{ color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <CheckCircle2 size={14} /> Cruce con {t.match.origen_tipo === 'CK' ? 'Cheque' : 'Movimiento'} #{t.match.documento} (${Number(t.match.monto).toFixed(2)})
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Sin coincidencia pendiente</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── MODAL 2: VISOR DE DETALLE DE DOCUMENTO ── */}
            <Modal
                open={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                title={`Detalle de ${selectedItem?.origen_tipo === 'CK' ? 'Cheque' : 'Movimiento Bancario'}`}
                size="md"
            >
                {selectedItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.9rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Tipo de Documento:</span>
                                <div style={{ fontWeight: 'bold' }}>{renderTipoBadge(selectedItem.tipo)} {selectedItem.origen_tipo === 'CK' ? 'Cheque' : 'Movimiento'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Número Documento / Cheque:</span>
                                <div style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{selectedItem.documento || 'N/A'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Fecha de Emisión:</span>
                                <div>{selectedItem.fecha_display || '-'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Fecha Aplicado / Conciliado:</span>
                                <div style={{ color: selectedItem.fecha_aplicado ? '#10b981' : '#f59e0b', fontWeight: '600' }}>
                                    {selectedItem.fecha_aplicado_display || 'Pendiente en Tránsito'}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Monto:</span>
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--primary)' }}>
                                    ${Number(selectedItem.monto_display || selectedItem.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Número de Partida:</span>
                                <div>{selectedItem.num_partida || 'Sin partida'}</div>
                            </div>
                        </div>

                        {selectedItem.beneficiario && (
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Beneficiario:</span>
                                <div style={{ fontWeight: '600' }}>{selectedItem.beneficiario}</div>
                            </div>
                        )}

                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Concepto / Descripción:</span>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.6rem', borderRadius: 'var(--border-radius)' }}>
                                {selectedItem.concepto || '-'}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── MODAL 3: EDICIÓN DE MOVIMIENTO / CHEQUE ── */}
            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Editar Documento en Conciliación"
                size="md"
            >
                <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Documento / Cheque:</label>
                        <input 
                            type="text" 
                            value={editFormData.documento} 
                            onChange={e => setEditFormData({ ...editFormData, documento: e.target.value.toUpperCase() })}
                            style={{ width: '100%', height: '42px', textTransform: 'uppercase' }} 
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Concepto:</label>
                        <input 
                            type="text" 
                            value={editFormData.concepto} 
                            onChange={e => setEditFormData({ ...editFormData, concepto: e.target.value.toUpperCase() })}
                            style={{ width: '100%', height: '42px', textTransform: 'uppercase' }} 
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Fecha:</label>
                        <input 
                            type="date" 
                            value={editFormData.fecha} 
                            onChange={e => setEditFormData({ ...editFormData, fecha: e.target.value })}
                            style={{ width: '100%', height: '42px' }} 
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Monto ($):</span>
                            {!canEditMonto && (
                                <span style={{ color: '#ef4444', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <ShieldAlert size={12} /> Requiere autorización
                                </span>
                            )}
                        </label>
                        <input 
                            type="number" 
                            step="0.01" 
                            disabled={!canEditMonto}
                            value={editFormData.monto} 
                            onChange={e => setEditFormData({ ...editFormData, monto: e.target.value })}
                            style={{ 
                                width: '100%', 
                                height: '42px', 
                                opacity: canEditMonto ? 1 : 0.6,
                                background: canEditMonto ? 'inherit' : 'rgba(255,255,255,0.03)'
                            }} 
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: 2 }}>
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── MODAL 4: CONFIRMAR Y GUARDAR VALIDACIÓN ── */}
            <Modal
                open={showValidationModal}
                onClose={() => setShowValidationModal(false)}
                title="Procesar y Guardar Validación de Saldo"
                size="md"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Se registrará una instantánea oficial del estado de conciliación para la cuenta <strong>{cuentaInfo?.banco_nombre} - {cuentaInfo?.numero}</strong>.
                    </p>

                    <div className="card glass" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Saldo en Banco:</span>
                            <strong>${Number(saldoBancoActual).toFixed(2)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Saldo en Chequera:</span>
                            <strong>${Number(saldoChequeraActual).toFixed(2)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', color: esDiferenciaCero ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            <span>Diferencia:</span>
                            <span>${Number(diferenciaActual).toFixed(2)}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button onClick={() => setShowValidationModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button onClick={handleGuardarValidacion} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <Check size={16} /> Confirmar Validación
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
