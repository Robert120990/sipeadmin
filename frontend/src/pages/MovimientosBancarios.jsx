import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { Landmark, Hash, FileText, Search, Plus, Calendar, Filter, Save, Trash2, Download, ChevronLeft, ChevronRight, AlertCircle, Edit2, ArrowDownCircle, ArrowUpCircle, Tag, MapPin, CheckCircle } from 'lucide-react';
import { todayStr } from '../utils/date';

export default function MovimientosBancarios() {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
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
        desde: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
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
    const isDebitTipo = (cod) => cod === '01' || cod === '03' || cod === 'NC' || cod === 'CH';

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
            const res = await api.get('/bancos/movimientos', { params: filters });
            setMovements(res.data || []);
        } catch (err) {
            addToast('Error al cargar historial', 'error');
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
        
        const isTransfer = isTransferTipo(formData.cod_remesa);
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

        let calculatedTipo = 'ABONO';
        if (isDebitTipo(formData.cod_remesa)) {
            calculatedTipo = 'CARGO';
        }

        const dataToSubmit = {
            ...formData,
            tipo: calculatedTipo,
            is_transferencia: isTransfer
        };

        try {
            if (editingMovement) {
                await api.put(`/bancos/movimientos/${editingMovement.id}`, dataToSubmit);
                addToast('Movimiento actualizado con éxito', 'success');
            } else {
                await api.post('/bancos/movimientos', dataToSubmit);
                addToast(isTransfer ? 'Transferencia entre cuentas registrada con éxito' : 'Movimiento registrado con éxito', 'success');
            }
            setShowModal(false);
            fetchMovements();
        } catch (err) {
            addToast(err.response?.data?.message || `Error al ${editingMovement ? 'actualizar' : 'registrar'} movimiento`, 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!await confirm('¿Está seguro de eliminar este movimiento?', { variant: 'danger' })) return;
        try {
            await api.delete(`/bancos/movimientos/${id}`);
            addToast('Movimiento eliminado', 'success');
            fetchMovements();
        } catch (err) {
            addToast('Error al eliminar movimiento', 'error');
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
        addToast('Exportando a Excel...', 'info');
    };

    return (
        <div>
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
            <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Empresa</label>
                        <select 
                            style={{ width: '100%' }}
                            value={filters.id_empresa}
                            onChange={e => setFilters({...filters, id_empresa: e.target.value})}
                        >
                            <option value="">Todas las empresas</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta</label>
                        <select 
                            style={{ width: '100%' }}
                            value={filters.numero_cuenta}
                            onChange={e => setFilters({...filters, numero_cuenta: e.target.value})}
                        >
                            <option value="">Todas las cuentas</option>
                            {cuentas.filter(c => !filters.id_empresa || c.id_empresa === filters.id_empresa).map(acc => (
                                <option key={acc.corr} value={acc.numero}>{acc.banco_nombre} - {acc.numero}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde</label>
                        <input 
                            type="date" 
                            value={filters.desde}
                            onChange={e => setFilters({...filters, desde: e.target.value})}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta</label>
                        <input 
                            type="date" 
                            value={filters.hasta}
                            onChange={e => setFilters({...filters, hasta: e.target.value})}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input 
                                type="text" 
                                placeholder="Buscar en resultados..." 
                                style={{ paddingLeft: '2.5rem', width: '100%' }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="btn-secondary" onClick={() => fetchMovements()} title="Actualizar">
                            <Filter size={18} />
                        </button>
                    </div>
                </div>
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
                                        {m.es_contabilizado !== 'S' ? (
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
                                                    style={{ background: 'none', color: '#ef4444', padding: '0.25rem' }} 
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
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
                    {isTransferTipo(formData.cod_remesa) ? (
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
                                    {cuentas.filter(c => !formData.id_empresa || c.id_empresa === formData.id_empresa).map(c => (
                                        <option key={c.corr} value={c.numero}>
                                            {c.banco_nombre ? `${c.banco_nombre} - ` : ''}{c.numero} - {c.nombre}
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
                                    {cuentas.filter(c => !formData.id_empresa || c.id_empresa === formData.id_empresa).map(c => (
                                        <option key={c.corr} value={c.numero}>
                                            {c.banco_nombre ? `${c.banco_nombre} - ` : ''}{c.numero} - {c.nombre}
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
                                {cuentas.filter(c => c.id_empresa === formData.id_empresa).map(c => (
                                    <option key={c.corr} value={c.numero}>{c.banco_nombre ? `${c.banco_nombre} - ` : ''}{c.numero} - {c.nombre}</option>
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
                                    {isTransferTipo(formData.cod_remesa) ? (
                                        <>⇄ Tipo: TRANSFERENCIA ENTRE CUENTAS (Débito y Crédito)</>
                                    ) : isDebitTipo(formData.cod_remesa) ? (
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
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={18} />
                            {editingMovement ? 'Actualizar Movimiento' : 'Guardar Movimiento'}
                        </button>
                    </div>
                </form>
            </Modal>

            <style dangerouslySetInnerHTML={{ __html: `
                .hover-row:hover { background: rgba(255,255,255,0.03); }
                input[type="date"] { color-scheme: dark; }
                textarea { width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--border-radius); color: var(--text); resize: none; }
                textarea:focus { outline: none; border-color: var(--primary); }
            `}} />
        </div>
    );
}
