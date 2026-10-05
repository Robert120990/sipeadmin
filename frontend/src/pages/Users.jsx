import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { UserPlus, Edit2, Trash2, Save, AlertTriangle } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', nombre: '', email: '', password: '', role_id: '', status: 'active' });
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
        try {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
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
        const trimmedUser = formData.username.trim();
        const trimmedNombre = formData.nombre.trim();

        if (!trimmedUser) {
            addToast('El nombre de usuario es requerido', 'warning');
            return;
        }
        if (!trimmedNombre) {
            addToast('El nombre completo es requerido', 'warning');
            return;
        }
        if (!editingUser && (!formData.password || formData.password.length < 8)) {
            addToast('La contraseña debe tener al menos 8 caracteres', 'warning');
            return;
        }
        if (editingUser && formData.password && formData.password.length < 8) {
            addToast('La nueva contraseña debe tener al menos 8 caracteres', 'warning');
            return;
        }
        if (!formData.role_id) {
            addToast('Debe seleccionar un rol para el usuario', 'warning');
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
            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, payload);
                addToast('Usuario actualizado con éxito', 'success');
            } else {
                await api.post('/users', payload);
                addToast('Usuario creado con éxito', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.response?.data?.detail || 'Error al guardar usuario';
            addToast(errorMsg, 'error');
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
                <form onSubmit={handleSubmit} className="form-grid">
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de Usuario</label>
                        <input 
                            type="text" 
                            value={formData.username} 
                            onChange={e => setFormData({...formData, username: e.target.value})}
                            required 
                            placeholder="ej. jsosa"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre Completo</label>
                        <input 
                            type="text" 
                            value={formData.nombre} 
                            onChange={e => setFormData({...formData, nombre: e.target.value})}
                            required 
                            placeholder="ej. Juan Sosa"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Correo Electrónico (Opcional)</label>
                        <input 
                            type="email" 
                            value={formData.email} 
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            placeholder="usuario@ejemplo.com"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                            Contraseña {editingUser ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(dejar en blanco para conservar actual)</span>
                            ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(mínimo 8 caracteres)</span>
                            )}
                        </label>
                        <input 
                            type="password" 
                            value={formData.password} 
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            required={!editingUser}
                            minLength={editingUser ? undefined : 8}
                            placeholder={editingUser ? 'Dejar en blanco para conservar' : 'Mínimo 8 caracteres'}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Rol</label>
                        <select 
                            style={{ width: '100%', padding: '0.65rem 0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text)' }}
                            value={formData.role_id}
                            onChange={e => setFormData({...formData, role_id: e.target.value})}
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
                            onChange={e => setFormData({...formData, status: e.target.value})}
                        >
                            <option value="active">Activo</option>
                            <option value="inactive">Inactivo</option>
                        </select>
                    </div>
                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                        <Save size={18} />
                        {editingUser ? 'Actualizar' : 'Crear Usuario'}
                    </button>
                </form>
            </Modal>
        </div>
    );
}
