import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { UserPlus, Edit2, Trash2, Save, AlertTriangle, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', nombre: '', email: '', password: '', role_id: '', status: 'active' });
    const [formError, setFormError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                api.get('/users'),
                api.get('/roles')
            ]);
            setUsers(usersRes.data || []);
            setRoles(rolesRes.data || []);
            setLoading(false);
        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Error al cargar datos de usuarios y roles';
            addToast(errorMsg, 'error');
            setLoading(false);
        }
    };

    const handleOpenModal = (user = null) => {
        setFormError('');
        setShowPassword(false);
        if (user) {
            setEditingUser(user);
            const userRoleId = user.role_id ? String(user.role_id) : (roles.find(r => r.name === user.role_name)?.id ? String(roles.find(r => r.name === user.role_name).id) : '');
            setFormData({ 
                username: user.username, 
                nombre: user.nombre || '', 
                email: user.email || '', 
                password: '', 
                role_id: userRoleId, 
                status: user.status || 'active' 
            });
        } else {
            setEditingUser(null);
            setFormData({ 
                username: '', 
                nombre: '', 
                email: '', 
                password: '', 
                role_id: roles.length > 0 ? String(roles[0].id) : '', 
                status: 'active' 
            });
        }
        setShowModal(true);
    };

    const toggleStatus = async (user) => {
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        const isDeactivating = newStatus === 'inactive';
        const ok = await confirm(
            `¿Estás seguro de ${isDeactivating ? 'desactivar' : 'activar'} al usuario "${user.nombre || user.username}"?`,
            isDeactivating ? { variant: 'danger' } : {}
        );
        if (!ok) return;
        try {
            await api.put(`/users/${user.id}/status`, { status: newStatus });
            addToast(`Usuario ${newStatus === 'active' ? 'activado' : 'desactivado'} con éxito`, 'success');
            fetchData();
        } catch(err) {
            const errorMsg = err.response?.data?.message || 'Error al actualizar estado';
            addToast(errorMsg, 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setFormError('');
        const trimmedUser = formData.username.trim();
        const trimmedNombre = formData.nombre.trim();

        const failValidation = (msg) => {
            setFormError(msg);
            addToast(msg, 'warning');
        };

        if (!trimmedUser) {
            failValidation('El nombre de usuario es requerido.');
            return;
        }
        if (!trimmedNombre) {
            failValidation('El nombre completo es requerido.');
            return;
        }
        if (!editingUser && (!formData.password || !formData.password.trim())) {
            failValidation('La contraseña es requerida y debe tener al menos 8 caracteres.');
            return;
        }
        if (formData.password) {
            if (!formData.password.trim()) {
                failValidation('La contraseña no puede contener solo espacios en blanco.');
                return;
            }
            if (formData.password !== formData.password.trim()) {
                failValidation('La contraseña no debe tener espacios al inicio ni al final.');
                return;
            }
            if (formData.password.length < 8) {
                failValidation('La contraseña debe tener al menos 8 caracteres.');
                return;
            }
        }
        if (!formData.role_id) {
            failValidation('Debe seleccionar un rol para el usuario.');
            return;
        }

        const payload = {
            ...formData,
            username: trimmedUser,
            nombre: trimmedNombre,
            email: formData.email ? formData.email.trim() : null,
            role_id: parseInt(formData.role_id, 10)
        };

        try {
            setSubmitting(true);
            if (editingUser) {
                const res = await api.put(`/users/${editingUser.id}`, payload);
                addToast(res?.data?.message || 'Usuario actualizado con éxito', 'success');
            } else {
                await api.post('/users', payload);
                addToast('Usuario creado con éxito', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.response?.data?.detail || 'Error al guardar usuario';
            setFormError(errorMsg);
            addToast(errorMsg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (await confirm('¿Estás seguro de eliminar este usuario?', { variant: 'danger' })) {
            try {
                await api.delete(`/users/${id}`);
                addToast('Usuario eliminado con éxito', 'success');
                fetchData();
            } catch (err) {
                const errorMsg = err.response?.data?.message || 'Error al eliminar usuario';
                addToast(errorMsg, 'error');
            }
        }
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Gestión de Usuarios</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Administra las cuentas de usuario y sus roles.</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <UserPlus size={18} />
                    Nuevo Usuario
                </button>
            </div>

            <div className="card glass table-responsive">
                <table className="table-to-cards">
                    <thead>
                        <tr>
                            <th>Usuario (Login)</th>
                            <th>Nombre</th>
                            <th>Email</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Fecha Creación</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td data-label="Usuario" style={{ fontWeight: '500' }}>{user.username}</td>
                                <td data-label="Nombre">{user.nombre || '-'}</td>
                                <td data-label="Email">{user.email || '-'}</td>
                                <td data-label="Rol">{user.role_name}</td>
                                <td data-label="Estado">
                                    <button onClick={() => toggleStatus(user)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} title="Clic para cambiar estado">
                                        <span className={`badge badge-${user.status}`}>
                                             {user.status === 'active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </button>
                                </td>
                                <td data-label="Fecha" style={{ color: 'var(--text-muted)' }}>
                                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                                </td>
                                <td data-label="Acciones">
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                            onClick={() => handleOpenModal(user)}
                                            style={{ background: 'none', color: 'var(--text-muted)' }} 
                                            title="Editar"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(user.id)}
                                            style={{ background: 'none', color: 'var(--danger)' }} 
                                            title="Eliminar"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal open={showModal} onClose={() => setShowModal(false)} title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'} size="md">
                <form onSubmit={handleSubmit} className="form-grid" autoComplete="off">
                    {formError && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: 'var(--danger)',
                            fontSize: '0.84rem'
                        }}>
                            <AlertCircle size={16} style={{ flexShrink: 0 }} />
                            <span>{formError}</span>
                        </div>
                    )}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de Usuario</label>
                        <input 
                            type="text" 
                            value={formData.username} 
                            onChange={e => { setFormError(''); setFormData({...formData, username: e.target.value}); }}
                            required 
                            autoComplete="off"
                            placeholder="ej. jsosa"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre Completo</label>
                        <input 
                            type="text" 
                            value={formData.nombre} 
                            onChange={e => { setFormError(''); setFormData({...formData, nombre: e.target.value}); }}
                            required 
                            placeholder="ej. Juan Sosa"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Correo Electrónico (Opcional)</label>
                        <input 
                            type="email" 
                            value={formData.email} 
                            onChange={e => { setFormError(''); setFormData({...formData, email: e.target.value}); }}
                            placeholder="usuario@ejemplo.com"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                            Contraseña {editingUser ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(mínimo 8 caracteres; dejar en blanco para conservar actual)</span>
                            ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(mínimo 8 caracteres)</span>
                            )}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type={showPassword ? 'text' : 'password'}
                                value={formData.password} 
                                onChange={e => { setFormError(''); setFormData({...formData, password: e.target.value}); }}
                                required={!editingUser}
                                minLength={editingUser ? (formData.password ? 8 : undefined) : 8}
                                autoComplete="new-password"
                                style={{ paddingRight: '40px' }}
                                placeholder={editingUser ? 'Dejar en blanco para conservar (mín. 8 si cambia)' : 'Mínimo 8 caracteres'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Rol</label>
                        <select 
                            style={{ width: '100%', padding: '0.65rem 0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text)' }}
                            value={formData.role_id}
                            onChange={e => { setFormError(''); setFormData({...formData, role_id: e.target.value}); }}
                            required
                        >
                            <option value="" disabled>-- Seleccione un rol --</option>
                            {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                        {roles.length === 0 && (
                            <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <AlertTriangle size={14} />
                                No se encontraron roles disponibles. Cree un rol primero en Permisos.
                            </span>
                        )}
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Estado</label>
                        <select 
                            style={{ width: '100%', padding: '0.65rem 0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text)' }}
                            value={formData.status}
                            onChange={e => { setFormError(''); setFormData({...formData, status: e.target.value}); }}
                        >
                            <option value="active">Activo</option>
                            <option value="inactive">Inactivo</option>
                        </select>
                    </div>
                    <button type="submit" disabled={submitting} className="btn-primary" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', opacity: submitting ? 0.7 : 1 }}>
                        <Save size={18} />
                        {submitting ? 'Guardando...' : (editingUser ? 'Actualizar' : 'Crear Usuario')}
                    </button>
                </form>
            </Modal>
        </div>
    );
}
