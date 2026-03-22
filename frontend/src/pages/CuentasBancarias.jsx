import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Landmark, User, Hash, Edit2, X, Save, Plus, CheckCircle, XCircle, FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';

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

    const [formData, setFormData] = useState({ 
        id_empresa: '', 
        cod_banco: '', 
        numero: '', 
        nombre: '', 
        activa: 'S',
        cod_tipo: '',
        cod_cta: ''
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
            setEditingAccount(account);
            await fetchCatalogsForCompany(account.id_empresa);
            setFormData({ 
                id_empresa: account.id_empresa, 
                cod_banco: account.cod_banco, 
                numero: account.numero, 
                nombre: account.nombre, 
                activa: account.activa,
                cod_tipo: account.cod_tipo || '',
                cod_cta: account.cod_cta || ''
            });
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
                cod_cta: ''
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

    const toggleStatus = async (account) => {
        try {
            const newStatus = account.activa === 'S' ? 'N' : 'S';
            await api.put(`/bancos/cuentas/${account.corr}`, { ...account, activa: newStatus });
            addToast(`Cuenta ${newStatus === 'S' ? 'activada' : 'desactivada'}`, 'success');
            fetchData();
        } catch (err) {
            addToast('Error al cambiar estado', 'error');
        }
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
                <table style={{ fontSize: '0.85rem', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>ID</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Empresa</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Banco</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Tipo</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Cuenta Contable</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Número de Cuenta</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Estado</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedAccounts.length === 0 ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron cuentas bancarias.
                                </td>
                            </tr>
                        ) : (
                            paginatedAccounts.map(account => (
                                <tr key={account.corr} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{account.corr}</td>
                                    <td style={{ padding: '0.5rem 1rem', fontWeight: '500' }}>{account.empresa_nombre || account.id_empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{account.banco_nombre || account.cod_banco}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>
                                        <span>{account.tipo_nombre || account.cod_tipo || '-'}</span>
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem' }}>
                                        <code style={{ color: 'var(--primary)' }}>{account.cod_cta || '-'}</code>
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
                            ))
                        )}
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
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

                            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
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
        </div>
    );
}
