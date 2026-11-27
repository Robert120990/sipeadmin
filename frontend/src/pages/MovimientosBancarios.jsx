import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { Landmark, FileText, Search, Plus, Calendar, Filter, Save, Trash2, Download, ChevronLeft, ChevronRight, AlertCircle, Edit2, ArrowDownCircle, ArrowUpCircle, CheckCircle, Lock } from 'lucide-react';
import { todayStr, offsetDaysStr } from '../utils/date';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

const makeIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export default function MovimientosBancarios() {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [truncatedInfo, setTruncatedInfo] = useState({ truncated: false, total: 0 });
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Catalogs
    const [cuentas, setCuentas] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [remesas, setRemesas] = useState([]);

    // Filters
    const [filters, setFilters] = useState({
        id_empresa: '',
        numero_cuenta: '',
        desde: offsetDaysStr(-30),
        hasta: todayStr()
    });

    const [formData, setFormData] = useState({
        id_empresa: '',
        numero_cuenta: '',
        numero_cuenta_debitar: '',
        numero_cuenta_acreditar: '',
        fecha: todayStr(),
        fecha_aplicado: '',
        documento: '',
        concepto: '',
        monto: '',
        tipo: 'ABONO',
        cod_remesa: '',
        cod_cta: '',
        num_partida: ''
    });

    const [editingMovement, setEditingMovement] = useState(null);

    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const isTransferTipo = (cod) => cod === 'TR' || cod === 'TRANSFERENCIA';
    const isDebitTipo = (cod) => cod === '02' || cod === 'NC' || cod === 'CH';

    useEffect(() => {
        fetchInitialCatalogs();
    }, []);

    useEffect(() => {
        fetchMovements();
    }, []);

    const fetchInitialCatalogs = async () => {
        try {
            const res = await api.get('/bancos/movimientos/catalogos');
            setCuentas(res.data.cuentas || []);
            setEmpresas(res.data.empresas || []);
        } catch (err) {
            addToast('Error al cargar catálogos', 'error');
        }
    };

    const fetchMovements = async () => {
        setLoading(true);
        try {
            const res = await api.get('/bancos/movimientos', { params: { ...filters, limit: 1500 } });
            setMovements(res.data || []);
            const isTrunc = String(res.headers?.['x-truncated'] || '').toLowerCase() === 'true';
            const totalCnt = Number(res.headers?.['x-total-count'] || (res.data || []).length);
            setTruncatedInfo({ truncated: isTrunc, total: totalCnt });
            setCurrentPage(1);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar historial', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCatalogsForCompany = async (id_empresa, movementToEdit = null) => {
        if (!id_empresa) return;
        try {
            const res = await api.get(`/bancos/movimientos/catalogos?id_empresa=${id_empresa}`);
            const sortedRemesas = (res.data.remesas || []).sort((a, b) => a.id.localeCompare(b.id));
            setRemesas(sortedRemesas);
            
            if (!movementToEdit) {
                setFormData(prev => ({
                    ...prev,
                    cod_remesa: sortedRemesas[0]?.id || ''
                }));
            }
        } catch (err) {
            addToast('Error al cargar tipos de remesa', 'error');
        }
    };

    const handleCompanyChange = (id_empresa) => {
        setFormData(prev => ({
            ...prev,
            id_empresa,
            numero_cuenta: '',
            numero_cuenta_debitar: '',
            numero_cuenta_acreditar: '',
            cod_remesa: ''
        }));
        if (id_empresa) fetchCatalogsForCompany(id_empresa);
    };

    const handleDebitAccountChange = (debitNum) => {
        const debitAcc = cuentas.find(c => c.numero === debitNum);
        const creditAcc = cuentas.find(c => c.numero === formData.numero_cuenta_acreditar);
        let autoConcepto = formData.concepto;
        
        if (!autoConcepto || autoConcepto.startsWith('TRANSFERENCIA DE') || autoConcepto.startsWith('TRANSFERENCIA PARA')) {
            const debName = debitAcc ? (debitAcc.nombre || debitAcc.numero) : '';
            const credName = creditAcc ? (creditAcc.nombre || creditAcc.numero) : '';
            if (debName && credName) {
                autoConcepto = `TRANSFERENCIA DE ${debName} PARA ${credName} / `;
            } else if (debName) {
                autoConcepto = `TRANSFERENCIA DE ${debName} / `;
            }
        }
        
        setFormData(prev => ({
            ...prev,
            numero_cuenta_debitar: debitNum,
            concepto: autoConcepto
        }));
    };

    const handleCreditAccountChange = (creditNum) => {
        const creditAcc = cuentas.find(c => c.numero === creditNum);
        const debitAcc = cuentas.find(c => c.numero === formData.numero_cuenta_debitar);
        let autoConcepto = formData.concepto;
        
        if (!autoConcepto || autoConcepto.startsWith('TRANSFERENCIA DE') || autoConcepto.startsWith('TRANSFERENCIA PARA')) {
            const debName = debitAcc ? (debitAcc.nombre || debitAcc.numero) : '';
            const credName = creditAcc ? (creditAcc.nombre || creditAcc.numero) : '';
            if (debName && credName) {
                autoConcepto = `TRANSFERENCIA DE ${debName} PARA ${credName} / `;
            } else if (credName) {
                autoConcepto = `TRANSFERENCIA PARA ${credName} / `;
            }
        }
        
        setFormData(prev => ({
            ...prev,
            numero_cuenta_acreditar: creditNum,
            concepto: autoConcepto
        }));
    };

    const handleRemesaChange = (newCodRemesa) => {
        const isTransfer = isTransferTipo(newCodRemesa);
        let nextDebitar = formData.numero_cuenta_debitar;
        let nextAcreditar = formData.numero_cuenta_acreditar;
        let autoConcepto = formData.concepto;
        
        if (isTransfer) {
            if (!nextDebitar && formData.numero_cuenta) {
                nextDebitar = formData.numero_cuenta;
            }
            if (!autoConcepto) {
                const debAcc = cuentas.find(c => c.numero === nextDebitar);
                const credAcc = cuentas.find(c => c.numero === nextAcreditar);
                const debName = debAcc ? (debAcc.nombre || debAcc.numero) : '';
                const credName = credAcc ? (credAcc.nombre || credAcc.numero) : '';
                if (debName && credName) autoConcepto = `TRANSFERENCIA DE ${debName} PARA ${credName} / `;
                else if (debName) autoConcepto = `TRANSFERENCIA DE ${debName} / `;
            }
        }
        
        setFormData(prev => ({
            ...prev,
            cod_remesa: newCodRemesa,
            numero_cuenta_debitar: nextDebitar,
            numero_cuenta_acreditar: nextAcreditar,
            concepto: autoConcepto
        }));
    };

    const handleOpenModal = async (movement = null) => {
        if (movement) {
            setEditingMovement(movement);
            const formatDateForInput = (str) => {
                if (!str) return '';
                const parts = str.split('/');
                if (parts.length !== 3) return '';
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            };

            setFormData({
                id_empresa: movement.id_empresa,
                numero_cuenta: movement.numero_cuenta,
                numero_cuenta_debitar: movement.numero_cuenta,
                numero_cuenta_acreditar: '',
                fecha: formatDateForInput(movement.fecha),
                fecha_aplicado: formatDateForInput(movement.fecha_aplicado),
                documento: movement.documento,
                concepto: movement.concepto,
                monto: movement.monto,
                tipo: movement.cargo > 0 ? 'CARGO' : 'ABONO',
                cod_remesa: movement.cod_remesa,
                cod_cta: movement.cod_cta || '',
                num_partida: movement.num_partida || ''
            });
            await fetchCatalogsForCompany(movement.id_empresa, movement);
        } else {
            setEditingMovement(null);
            setFormData({
                id_empresa: '',
                numero_cuenta: '',
                numero_cuenta_debitar: '',
                numero_cuenta_acreditar: '',
                fecha: todayStr(),
                fecha_aplicado: '',
                documento: '',
                concepto: '',
                monto: '',
                tipo: 'ABONO',
                cod_remesa: '',
                cod_cta: '',
                num_partida: ''
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        const isTransfer = !editingMovement && isTransferTipo(formData.cod_remesa);
        if (isTransfer) {
            if (!formData.numero_cuenta_debitar || !formData.numero_cuenta_acreditar) {
                addToast('Debe seleccionar tanto la Cuenta a Debitar como la Cuenta a Acreditar', 'warning');
                return;
            }
            if (formData.numero_cuenta_debitar === formData.numero_cuenta_acreditar) {
                addToast('La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma cuenta', 'warning');
                return;
            }
        } else {
            if (!formData.numero_cuenta) {
                addToast('Debe seleccionar una Cuenta Bancaria', 'warning');
                return;
            }
        }

        const montoNum = Number(formData.monto);
        if (!Number.isFinite(montoNum) || montoNum <= 0) {
            addToast('El monto debe ser mayor a $0.00', 'warning');
            return;
        }

        let calculatedTipo = 'ABONO';
        if (isDebitTipo(formData.cod_remesa)) {
            calculatedTipo = 'CARGO';
        } else if (isTransferTipo(formData.cod_remesa) && editingMovement) {
            calculatedTipo = formData.tipo === 'CARGO' ? 'CARGO' : 'ABONO';
        }

        const dataToSubmit = {
            ...formData,
            tipo: calculatedTipo,
            is_transferencia: isTransfer,
            ...(editingMovement ? { version: editingMovement.version } : {})
        };

        setSubmitting(true);
        try {
            if (editingMovement) {
                await api.put(`/bancos/movimientos/${editingMovement.id}`, dataToSubmit);
                addToast('Movimiento actualizado con éxito', 'success');
            } else {
                await api.post('/bancos/movimientos', dataToSubmit, {
                    headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
                });
                addToast(isTransfer ? 'Transferencia entre cuentas registrada con éxito' : 'Movimiento registrado con éxito', 'success');
            }
            setShowModal(false);
            fetchMovements();
        } catch (err) {
            addToast(err.response?.data?.message || `Error al ${editingMovement ? 'actualizar' : 'registrar'} movimiento`, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (submitting) return;
        if (!await confirm('¿Está seguro de eliminar este movimiento? Quedará respaldado en auditoría.', { variant: 'danger' })) return;
        setSubmitting(true);
        try {
            await api.delete(`/bancos/movimientos/${id}`);
            addToast('Movimiento eliminado', 'success');
            fetchMovements();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar movimiento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredMovements = useMemo(() => {
        if (!searchTerm) return movements;
        const lowSearch = searchTerm.toLowerCase();
        return movements.filter(m => 
            (m.concepto || '').toLowerCase().includes(lowSearch) ||
            (m.documento || '').toLowerCase().includes(lowSearch) ||
            (m.llave || '').toLowerCase().includes(lowSearch)
        );
    }, [movements, searchTerm]);

    const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
    const paginatedMovements = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredMovements.slice(start, start + itemsPerPage);
    }, [filteredMovements, currentPage]);

    const handleExportExcel = () => {
        if (!filteredMovements.length) {
            addToast('No hay movimientos para exportar', 'warning');
            return;
        }
        try {
            const rows = filteredMovements.map(m => ({
                Fecha: m.fecha || '',
                'Fecha Aplicado': m.fecha_aplicado || '',
                Llave: m.llave || '',
                Documento: m.documento || '',
                Empresa: m.empresa_nombre || m.id_empresa || '',
                Cuenta: m.numero_cuenta || '',
                Tipo: Number(m.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
                Concepto: m.concepto || '',
                'Cargo ($)': Number(m.cargo || 0),
                'Abono ($)': Number(m.abono || 0),
                Monto: Number(m.monto ?? 0),
                Partida: m.num_partida || ''
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
            XLSX.writeFile(wb, `movimientos_bancarios_${filters.desde || todayStr()}_${filters.hasta || todayStr()}.xlsx`);
            addToast(`Exportados ${rows.length} movimientos a Excel`, 'success');
        } catch (err) {
            addToast('Error al exportar movimientos a Excel', 'error');
        }
    };

    return (
        <div className="movimientos-bancarios-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Landmark size={32} color="var(--primary)" />
                        Movimientos Bancarios
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Historial e ingreso de transacciones bancarias.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Plus size={18} />
                        Nuevo Movimiento
                    </button>
                    <button className="btn-secondary" onClick={handleExportExcel} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Download size={18} />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="card glass" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 180px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Empresa</label>
                        <select 
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            value={filters.id_empresa}
                            onChange={e => setFilters({...filters, id_empresa: e.target.value, numero_cuenta: ''})}
                        >
                            <option value="">Todas las empresas</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '2 1 260px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cuenta</label>
                        <select 
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            value={filters.numero_cuenta}
                            onChange={e => setFilters({...filters, numero_cuenta: e.target.value})}
                        >
                            <option value="">Todas las cuentas</option>
                            {sortCuentas(cuentas.filter(c => !filters.id_empresa || c.id_empresa === filters.id_empresa)).map(acc => (
                                <option key={acc.corr} value={acc.numero}>{formatCuentaLabel(acc)}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ width: '140px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Desde</label>
                        <input 
                            type="date" 
                            value={filters.desde}
                            onChange={e => setFilters({...filters, desde: e.target.value})}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '140px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hasta</label>
                        <input 
                            type="date" 
                            value={filters.hasta}
                            onChange={e => setFilters({...filters, hasta: e.target.value})}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 200px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input 
                                type="text" 
                                placeholder="Buscar..." 
                                style={{ paddingLeft: '2.1rem', width: '100%', height: '36px', fontSize: '0.825rem' }}
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button className="btn-secondary" onClick={() => fetchMovements()} title="Actualizar" style={{ height: '36px', padding: '0 0.85rem' }}>
                            <Filter size={16} />
                        </button>
                    </div>
                </div>
                {truncatedInfo.truncated && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertCircle size={14} />
                        <span>Mostrando los primeros {movements.length} de {truncatedInfo.total} movimientos. Aplique filtros de cuenta o fechas más específicos para ver todo el detalle.</span>
                    </div>
                )}
            </div>

            {/* Main Table */}
            <div className="card glass table-responsive">
                <table style={{ fontSize: '0.75rem', width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Fecha</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Llave / Doc</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Cuenta</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Concepto</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Cargo (Debe)</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Abono (Haber)</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando movimientos...</td></tr>
                        ) : paginatedMovements.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No se encontraron movimientos para los filtros seleccionados.</td></tr>
                        ) : paginatedMovements.map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} className="hover-row">
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div>{m.fecha}</div>
                                    {m.fecha_aplicado && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Apl: {m.fecha_aplicado}</div>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>{m.llave}</div>
                                    <div style={{ color: 'var(--text-muted)' }}>{m.documento}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ fontWeight: '500' }}>{m.numero_cuenta}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.empresa_nombre}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }} title={m.concepto}>
                                    <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</div>
                                    {m.banco_nombre && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                            {m.banco_nombre}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.15rem' }}>
                                        {m.num_partida && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Pda: {m.num_partida}</span>}
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: m.cargo > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: m.cargo > 0 ? 'bold' : 'normal' }}>
                                    {m.cargo > 0 ? `$${parseFloat(m.cargo).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: m.abono > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: m.abono > 0 ? 'bold' : 'normal' }}>
                                    {m.abono > 0 ? `$${parseFloat(m.abono).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                        {m.es_contabilizado !== 'S' && !m.fecha_aplicado ? (
                                            <>
                                                <button 
                                                    onClick={() => handleOpenModal(m)}
                                                    style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} 
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(m.id)}
                                                    disabled={submitting}
                                                    style={{ background: 'none', color: '#ef4444', padding: '0.25rem' }} 
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        ) : m.fecha_aplicado ? (
                                            <span title={`Conciliado (${m.fecha_aplicado}) - Desconcilie primero para editar o eliminar`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#10b981', fontSize: '0.7rem' }}>
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

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Mostrando {paginatedMovements.length} de {filteredMovements.length} movimientos
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></button>
                            <span style={{ fontSize: '0.8rem' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>{editingMovement ? <Edit2 size={20} color="var(--primary)" /> : <Plus size={20} color="var(--primary)" />}{editingMovement ? 'Editar Movimiento' : 'Nuevo Movimiento Bancario'}</span>}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Empresa y Cuenta */}
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa</label>
                            <select 
                                style={{ width: '100%' }}
                                value={formData.id_empresa}
                                onChange={e => handleCompanyChange(e.target.value)}
                                required
                            >
                                <option value="">Seleccione Empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Partida Contable</label>
                            <div style={{ padding: '0 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', fontSize: '0.9rem', height: '42px', display: 'flex', alignItems: 'center' }}>
                                {formData.num_partida || <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin partida</span>}
                            </div>
                        </div>
                    </div>
                    {/* Cuenta Bancaria (Simple o Transferencia Debitar/Acreditar) */}
                    {!editingMovement && isTransferTipo(formData.cod_remesa) ? (
                        <div className="form-grid form-grid-2" style={{ gap: '1rem' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: '#ef4444' }}>
                                    <ArrowDownCircle size={16} /> CUENTA A DEBITAR (Origen / Salida)
                                </label>
                                <select 
                                    style={{ width: '100%', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                                    value={formData.numero_cuenta_debitar}
                                    onChange={e => handleDebitAccountChange(e.target.value)}
                                    disabled={!formData.id_empresa}
                                    required
                                >
                                    <option value="">Seleccione Cuenta a Debitar...</option>
                                    {sortCuentas(cuentas.filter(c => !formData.id_empresa || c.id_empresa === formData.id_empresa)).map(c => (
                                         <option key={c.corr} value={c.numero}>
                                             {formatCuentaLabel(c)}
                                         </option>
                                     ))}
                                </select>
                            </div>

                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: '#10b981' }}>
                                    <ArrowUpCircle size={16} /> CUENTA A ACREDITAR (Destino / Entrada)
                                </label>
                                <select 
                                    style={{ width: '100%', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                                    value={formData.numero_cuenta_acreditar}
                                    onChange={e => handleCreditAccountChange(e.target.value)}
                                    disabled={!formData.id_empresa}
                                    required
                                >
                                    <option value="">Seleccione Cuenta a Acreditar...</option>
                                    {sortCuentas(cuentas.filter(c => !formData.id_empresa || c.id_empresa === formData.id_empresa)).map(c => (
                                         <option key={c.corr} value={c.numero}>
                                             {formatCuentaLabel(c)}
                                         </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cuenta Bancaria</label>
                            <select 
                                style={{ width: '100%' }}
                                value={formData.numero_cuenta}
                                onChange={e => setFormData({...formData, numero_cuenta: e.target.value})}
                                disabled={!formData.id_empresa}
                                required
                            >
                                <option value="">Seleccione Cuenta...</option>
                                {sortCuentas(cuentas.filter(c => c.id_empresa === formData.id_empresa)).map(c => (
                                    <option key={c.corr} value={c.numero}>{formatCuentaLabel(c)}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Fecha y Documento */}
                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha Mov.</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '3rem' }} value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha Aplicado</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '3rem' }} value={formData.fecha_aplicado} onChange={e => setFormData({...formData, fecha_aplicado: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Documento / Ref</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" style={{ paddingLeft: '3rem', textTransform: 'uppercase' }} placeholder="Ej: 12345" value={formData.documento} onChange={e => setFormData({...formData, documento: e.target.value.toUpperCase()})} required />
                            </div>
                        </div>
                    </div>

                    {/* Remesa y Monto */}
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tipo Movimientos</label>
                            <select 
                                style={{ width: '100%' }}
                                value={formData.cod_remesa}
                                onChange={e => handleRemesaChange(e.target.value)}
                                disabled={!formData.id_empresa}
                                required
                            >
                                <option value="">Seleccione Tipo...</option>
                                {remesas.map(r => (
                                    <option key={r.id} value={r.id}>{r.descripcion}</option>
                                ))}
                            </select>
                            {formData.cod_remesa && (
                                <div style={{
                                    fontSize: '0.75rem',
                                    marginTop: '0.35rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    color: isTransferTipo(formData.cod_remesa) 
                                        ? '#3b82f6' 
                                        : isDebitTipo(formData.cod_remesa) 
                                            ? '#ef4444' 
                                            : '#10b981'
                                }}>
                                    {!editingMovement && isTransferTipo(formData.cod_remesa) ? (
                                        <>⇄ Tipo: TRANSFERENCIA ENTRE CUENTAS (Débito y Crédito)</>
                                    ) : (isDebitTipo(formData.cod_remesa) || (editingMovement && formData.tipo === 'CARGO')) ? (
                                        <>↓ Tipo: CARGO (-) / Salida de Fondos</>
                                    ) : (
                                        <>↑ Tipo: ABONO (+) / Entrada de Fondos</>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto ($)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem' }}>$</span>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="0.00" 
                                    style={{ paddingLeft: '2.5rem', fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}
                                    value={formData.monto} 
                                    onChange={e => setFormData({...formData, monto: e.target.value})}
                                    onFocus={(e) => e.target.select()}
                                    required 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Concepto */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Concepto / Descripción</label>
                        <input 
                            type="text"
                            placeholder="Descripción del movimiento..."
                            style={{ width: '100%', textTransform: 'uppercase' }}
                            value={formData.concepto} 
                            onChange={e => setFormData({...formData, concepto: e.target.value.toUpperCase()})}
                            required
                        />
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }} disabled={submitting}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={18} />
                            {submitting ? 'Guardando...' : (editingMovement ? 'Actualizar Movimiento' : 'Guardar Movimiento')}
                        </button>
                    </div>
                </form>
            </Modal>

            <style dangerouslySetInnerHTML={{ __html: `
                .movimientos-bancarios-page .hover-row:hover { background: rgba(255,255,255,0.03); }
                .movimientos-bancarios-page textarea { width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--border-radius); color: var(--text); resize: none; }
                .movimientos-bancarios-page textarea:focus { outline: none; border-color: var(--primary); }
            `}} />
        </div>
    );
}
