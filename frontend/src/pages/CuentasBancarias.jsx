import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Landmark, User, Hash, Edit2, X, Save, Plus, CheckCircle, XCircle, FileText, Search, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export default function CuentasBancarias() {
    const [accounts, setAccounts] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingToggle, setPendingToggle] = useState(null);

    const [formData, setFormData] = useState({ 
        id_empresa: '', 
        cod_banco: '', 
        numero: '', 
        nombre: '', 
        activa: 'S',
        cod_tipo: '',
        cod_cta: '',
        orden: ''
    });
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
        fetchInitialCompanies();
    }, []);

    const fetchData = async () => {
        try {
            const res = await api.get('/bancos/cuentas');
            setAccounts(res.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar cuentas bancarias', 'error');
        }
    };

    const fetchInitialCompanies = async () => {
        try {
            const res = await api.get('/bancos/catalogos');
            setEmpresas(res.data.empresas);
        } catch (err) {
            addToast('Error al cargar empresas', 'error');
        }
    };

    const fetchCatalogsForCompany = async (id_empresa) => {
        if (!id_empresa) return;
        try {
            const res = await api.get(`/bancos/catalogos?id_empresa=${id_empresa}`);
            setBancos(res.data.bancos);
            setTipos(res.data.tipos);
            
            if (!editingAccount) {
                setFormData(prev => ({ 
                    ...prev, 
                    cod_banco: res.data.bancos[0]?.id || '',
                    cod_tipo: res.data.tipos[0]?.id || ''
                }));
            }
        } catch (err) {
            addToast('Error al cargar bancos y tipos para la empresa', 'error');
        }
    };

    // Filters and Pagination logic
    const filteredAccounts = useMemo(() => {
        if (!searchTerm) return accounts;
        const lowSearch = searchTerm.toLowerCase();
        return accounts.filter(acc => 
            (acc.numero || '').toLowerCase().includes(lowSearch) ||
            (acc.nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.empresa_nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.banco_nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.cod_cta || '').toLowerCase().includes(lowSearch)
        );
    }, [accounts, searchTerm]);

    const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
    const paginatedAccounts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAccounts.slice(start, start + itemsPerPage);
    }, [filteredAccounts, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleCompanyChange = (id_empresa) => {
        setFormData(prev => ({ ...prev, id_empresa, cod_banco: '', cod_tipo: '' }));
        fetchCatalogsForCompany(id_empresa);
    };

    const handleOpenModal = async (account = null) => {
        if (account) {
            const ordenValue = account.orden !== undefined && account.orden !== null ? account.orden : '';
            setFormData({
                id_empresa: account.id_empresa, 
                cod_banco: account.cod_banco, 
                numero: account.numero, 
                nombre: account.nombre, 
                activa: account.activa,
                cod_tipo: account.cod_tipo || '',
                cod_cta: account.cod_cta || '',
                orden: ordenValue
            });
            setEditingAccount(account);
            await fetchCatalogsForCompany(account.id_empresa);
        } else {
            setEditingAccount(null);
            const firstEmp = empresas[0]?.id || '';
            setFormData({ 
                id_empresa: firstEmp, 
                cod_banco: '', 
                numero: '', 
                nombre: '', 
                activa: 'S',
                cod_tipo: '',
                cod_cta: '',
                orden: ''
            });
            if (firstEmp) fetchCatalogsForCompany(firstEmp);
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingAccount) {
                await api.put(`/bancos/cuentas/${editingAccount.corr}`, formData);
                addToast('Cuenta actualizada con éxito', 'success');
            } else {
                await api.post('/bancos/cuentas', formData);
                addToast('Cuenta creada con éxito', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast('Error al guardar la cuenta', 'error');
        }
    };

    const toggleStatus = (account) => {
        const newStatus = account.activa === 'S' ? 'N' : 'S';
        setPendingToggle({ account, newStatus });
        setShowConfirmModal(true);
    };

    const confirmToggle = async () => {
        if (!pendingToggle) return;
        const { account, newStatus } = pendingToggle;
        
        try {
            await api.put(`/bancos/cuentas/${account.corr}`, { ...account, activa: newStatus });
            addToast(`Cuenta ${newStatus === 'S' ? 'activada' : 'desactivada'}`, 'success');
            fetchData();
        } catch (err) {
            addToast('Error al cambiar estado', 'error');
        } finally {
            setShowConfirmModal(false);
            setPendingToggle(null);
        }
    };

    const cancelToggle = () => {
        setShowConfirmModal(false);
        setPendingToggle(null);
    };

    if (loading) return <div className="p-8 text-center text-muted">Cargando cuentas bancarias...</div>;

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Landmark size={32} color="var(--primary)" />
                        Cuentas Bancarias
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Gestión de cuentas por empresa y banco.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar cuenta..." 
                            style={{ paddingLeft: '3rem', width: '300px' }}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Plus size={18} />
                        Nueva Cuenta
                    </button>
                </div>
            </div>

            <div className="card glass" style={{ overflow: 'hidden' }}>
                <table style={{ fontSize: '0.75rem', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Empresa</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Banco</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Nombre de Cuenta</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '150px' }}>Cuenta Contable</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Número de Cuenta</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Estado</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedAccounts.length === 0 && (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron cuentas bancarias.
                                </td>
                            </tr>
                        )}
                        {paginatedAccounts.map(account => (
                            <tr key={account.corr} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.5rem 1rem', fontWeight: '500' }}>{account.empresa_nombre || account.id_empresa}</td>
                                <td style={{ padding: '0.5rem 1rem' }}>{account.banco_nombre || account.cod_banco}</td>
                                <td style={{ padding: '0.5rem 1rem' }}>
                                    <span>{account.nombre || '-'}</span>
                                </td>
                                <td style={{ padding: '0.5rem 1rem', minWidth: '150px' }}>
                                    {account.cod_cta ? (
                                        <code style={{ color: 'var(--primary)' }}>{account.cod_cta}</code>
                                    ) : (
                                        <span className="badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', background: 'rgba(255,193,7,0.2)', color: '#ffc007', border: '1px solid rgba(255,193,7,0.3)' }}>
                                            Sin Cta. Contable
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '0.5rem 1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Hash size={14} color="var(--text-muted)" />
                                        <code>{account.numero}</code>
                                    </div>
                                </td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                                    <button 
                                        onClick={() => toggleStatus(account)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    >
                                        {account.activa === 'S' ? (
                                            <span className="badge badge-active" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                                                Activa
                                            </span>
                                        ) : (
                                            <span className="badge badge-inactive" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                                                Inactiva
                                            </span>
                                        )}
                                    </button>
                                </td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                    <button 
                                        onClick={() => handleOpenModal(account)}
                                        style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} 
                                        title="Editar"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        padding: '1rem 1.5rem', borderTop: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.02)'
                    }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            Mostrando {paginatedAccounts.length} de {filteredAccounts.length} resultados
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem', minWidth: 'auto' }}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span style={{ fontSize: '0.875rem', padding: '0 1rem' }}>
                                Página <strong>{currentPage}</strong> de {totalPages}
                            </span>
                            <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem', minWidth: 'auto' }}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                    <div style={{ 
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                        background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', 
                        alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' 
                    }}>
                        <div className="card glass shadow-xl" style={{ width: '600px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {editingAccount ? <Edit2 size={24} /> : <Plus size={24} />}
                                    {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
                                </h2>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}>
                                    <X size={24} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa</label>
                                        <select 
                                            style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                            value={formData.id_empresa}
                                            onChange={e => handleCompanyChange(e.target.value)}
                                            required
                                        >
                                            <option value="">Seleccione Empresa</option>
                                            {empresas.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Estado</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({...formData, activa: formData.activa === 'S' ? 'N' : 'S'})}
                                                style={{
                                                    position: 'relative',
                                                    width: '44px',
                                                    height: '22px',
                                                    background: formData.activa === 'S' ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                                                    border: 'none',
                                                    borderRadius: '11px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.3s',
                                                    padding: 0
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: formData.activa === 'S' ? '24px' : '2px',
                                                        width: '18px',
                                                        height: '18px',
                                                        background: 'white',
                                                        borderRadius: '50%',
                                                        transition: 'left 0.3s'
                                                    }}
                                                />
                                            </button>
                                            <span style={{ fontSize: '0.8rem', color: formData.activa === 'S' ? 'var(--text)' : 'var(--text-muted)' }}>
                                                {formData.activa === 'S' ? 'Activa' : 'Inactiva'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Banco</label>
                                        <select 
                                            style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                            value={formData.cod_banco}
                                            onChange={e => setFormData({...formData, cod_banco: e.target.value})}
                                            required
                                            disabled={!formData.id_empresa}
                                        >
                                            <option value="">Seleccione Banco</option>
                                            {bancos.map(ban => (
                                                <option key={ban.id} value={ban.id}>{ban.descripcion}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tipo de Cuenta</label>
                                        <select 
                                            style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                            value={formData.cod_tipo}
                                            onChange={e => setFormData({...formData, cod_tipo: e.target.value})}
                                            required
                                            disabled={!formData.id_empresa}
                                        >
                                            <option value="">Seleccione Tipo</option>
                                            {tipos.map(t => (
                                                <option key={t.id} value={t.id}>{t.descripcion}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Número de Cuenta</label>
                                        <div style={{ position: 'relative' }}>
                                            <Hash size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input 
                                                type="text" 
                                                style={{ paddingLeft: '3rem' }}
                                                placeholder="000-0000000-00"
                                                value={formData.numero} 
                                                onChange={e => setFormData({...formData, numero: e.target.value})}
                                                required 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cta. Contable</label>
                                        <div style={{ position: 'relative' }}>
                                            <FileText size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input 
                                                type="text" 
                                                style={{ paddingLeft: '3rem' }}
                                                placeholder="1101-01-01"
                                                value={formData.cod_cta} 
                                                onChange={e => setFormData({...formData, cod_cta: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Orden</label>
                                        <input 
                                            type="number" 
                                            placeholder="0"
                                            value={formData.orden === undefined ? '' : formData.orden} 
                                            onChange={e => setFormData({...formData, orden: e.target.value})}
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nombre Alterno / Representante</label>
                                    <div style={{ position: 'relative' }}>
                                        <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            type="text" 
                                            style={{ paddingLeft: '3rem' }}
                                            placeholder="Ej: Cuenta de Planilla o Nombre del dueño"
                                            value={formData.nombre} 
                                            onChange={e => setFormData({...formData, nombre: e.target.value})}
                                            required 
                                        />
                                    </div>
                                </div>

                                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                        <Save size={18} />
                                        {editingAccount ? 'Actualizar Cuenta' : 'Guardar Cuenta'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {showConfirmModal && pendingToggle && (
                    <div style={{ 
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                        background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', 
                        alignItems: 'center', zIndex: 1100, backdropFilter: 'blur(8px)' 
                    }}>
                        <div className="card glass shadow-xl" style={{ width: '450px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>Confirmar Acción</h3>
                                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                                    ¿Está seguro que desea {pendingToggle.newStatus === 'S' ? 'activar' : 'desactivar'} la cuenta{' '}
                                    <strong>{pendingToggle.account.numero}</strong>?
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" onClick={cancelToggle} className="btn-secondary" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={confirmToggle} className="btn-primary" style={{ flex: 1 }}>
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
    );
}





