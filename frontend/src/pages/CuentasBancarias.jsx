import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Landmark, User, Hash, Edit2, Trash2, X, Save, Plus, Building2, CheckCircle, XCircle } from 'lucide-react';

export default function CuentasBancarias() {
    const [accounts, setAccounts] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [formData, setFormData] = useState({ id_empresa: '', cod_banco: '', numero: '', nombre: '', activa: 'S' });
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
        fetchCatalogos();
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

    const fetchCatalogos = async () => {
        try {
            const res = await api.get('/bancos/catalogos');
            setBancos(res.data.bancos);
            setEmpresas(res.data.empresas);
            
            if (res.data.empresas.length > 0 && !formData.id_empresa) {
                setFormData(prev => ({ ...prev, id_empresa: res.data.empresas[0].id }));
            }
            if (res.data.bancos.length > 0 && !formData.cod_banco) {
                setFormData(prev => ({ ...prev, cod_banco: res.data.bancos[0].id }));
            }
        } catch (err) {
            addToast('Error al cargar catálogos', 'error');
        }
    };

    const handleOpenModal = (account = null) => {
        if (account) {
            setEditingAccount(account);
            setFormData({ 
                id_empresa: account.id_empresa, 
                cod_banco: account.cod_banco, 
                numero: account.numero, 
                nombre: account.nombre, 
                activa: account.activa 
            });
        } else {
            setEditingAccount(null);
            setFormData({ 
                id_empresa: empresas[0]?.id || '', 
                cod_banco: bancos[0]?.id || '', 
                numero: '', 
                nombre: '', 
                activa: 'S' 
            });
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
                    <p style={{ color: 'var(--text-muted)' }}>Gestión de cuentas bancarias de la base de datos externa.</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Plus size={18} />
                    Nueva Cuenta
                </button>
            </div>

            <div className="card glass">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Empresa</th>
                            <th>Banco</th>
                            <th>Nombre Alterno</th>
                            <th>Número de Cuenta</th>
                            <th style={{ textAlign: 'center' }}>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron cuentas bancarias.
                                </td>
                            </tr>
                        ) : (
                            accounts.map(account => (
                                <tr key={account.corr}>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{account.corr}</td>
                                    <td style={{ fontWeight: '500' }}>{account.empresa_nombre || account.id_empresa}</td>
                                    <td>{account.banco_nombre || account.cod_banco}</td>
                                    <td>{account.nombre}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Hash size={14} color="var(--text-muted)" />
                                            <code>{account.numero}</code>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button 
                                            onClick={() => toggleStatus(account)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                        >
                                            {account.activa === 'S' ? (
                                                <span className="badge badge-active" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <CheckCircle size={12} /> Activa
                                                </span>
                                            ) : (
                                                <span className="badge badge-inactive" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <XCircle size={12} /> Inactiva
                                                </span>
                                            )}
                                        </button>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button 
                                                onClick={() => handleOpenModal(account)}
                                                style={{ background: 'none', color: 'var(--text-muted)' }} 
                                                title="Editar"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', 
                    alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' 
                }}>
                    <div className="card glass shadow-xl" style={{ width: '500px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {editingAccount ? <Edit2 size={24} /> : <Plus size={24} />}
                                {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
                            </h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa</label>
                                    <select 
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                        value={formData.id_empresa}
                                        onChange={e => setFormData({...formData, id_empresa: e.target.value})}
                                        required
                                    >
                                        <option value="">Seleccione Empresa</option>
                                        {empresas.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Banco</label>
                                    <select 
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                        value={formData.cod_banco}
                                        onChange={e => setFormData({...formData, cod_banco: e.target.value})}
                                        required
                                    >
                                        <option value="">Seleccione Banco</option>
                                        {bancos.map(ban => (
                                            <option key={ban.id} value={ban.id}>{ban.descripcion}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nombre Alterno / Descripción</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="text" 
                                        style={{ paddingLeft: '3rem' }}
                                        placeholder="Ej: Cuenta de Planilla"
                                        value={formData.nombre} 
                                        onChange={e => setFormData({...formData, nombre: e.target.value})}
                                        required 
                                    />
                                </div>
                            </div>

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

                            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
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
