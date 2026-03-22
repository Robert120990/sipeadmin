import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { UserPlus, Edit2, Trash2, X, Save, AlertTriangle } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', nombre: '', email: '', password: '', role_id: '', status: 'active' });
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                api.get('/users'),
                api.get('/roles')
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar datos', 'error');
        }
    };

    const handleOpenModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({ username: user.username, nombre: user.nombre || '', email: user.email || '', password: '', role_id: roles.find(r => r.name === user.role_name)?.id || '', status: user.status });
        } else {
            setEditingUser(null);
            setFormData({ username: '', nombre: '', email: '', password: '', role_id: roles[0]?.id || '', status: 'active' });
        }
        setShowModal(true);
    };

    const toggleStatus = async (user) => {
        try {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
            await api.put(`/users/${user.id}/status`, { status: newStatus });
            addToast('Estado actualizado', 'success');
            fetchData();
        } catch(err) {
            addToast('Error al actualizar estado', 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, formData);
                addToast('Usuario actualizado con éxito', 'success');
            } else {
                await api.post('/users', formData);
                addToast('Usuario creado con éxito', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast('Error al guardar usuario', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de eliminar este usuario?')) {
            try {
                await api.delete(`/users/${id}`);
                addToast('Usuario eliminado', 'success');
                fetchData();
            } catch (err) {
                addToast('Error al eliminar usuario', 'error');
            }
        }
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Gestión de Usuarios</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Administra las cuentas de usuario y sus roles.</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <UserPlus size={18} />
                    Nuevo Usuario
                </button>
            </div>

            <div className="card glass">
                <table>
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
                                <td style={{ fontWeight: '500' }}>{user.username}</td>
                                <td>{user.nombre || '-'}</td>
                                <td>{user.email || '-'}</td>
                                <td>{user.role_name}</td>
                                <td>
                                    <button onClick={() => toggleStatus(user)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} title="Clic para cambiar estado">
                                        <span className={`badge badge-${user.status}`}>
                                            {user.status === 'active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </button>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td>
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

            {showModal && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', 
                    alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' 
                }}>
                    <div className="card glass" style={{ width: '450px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de Usuario</label>
                                <input 
                                    type="text" 
                                    value={formData.username} 
                                    onChange={e => setFormData({...formData, username: e.target.value})}
                                    required 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre Completo</label>
                                <input 
                                    type="text" 
                                    value={formData.nombre} 
                                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                                    required 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Correo Electrónico (Opcional)</label>
                                <input 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                    Contraseña {editingUser && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(dejar en blanco para no cambiar)</span>}
                                </label>
                                <input 
                                    type="password" 
                                    value={formData.password} 
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                    required={!editingUser}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Rol</label>
                                <select 
                                    style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                    value={formData.role_id}
                                    onChange={e => setFormData({...formData, role_id: e.target.value})}
                                    required
                                >
                                    {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Estado</label>
                                <select 
                                    style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
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
                    </div>
                </div>
            )}
        </div>
    );
}
