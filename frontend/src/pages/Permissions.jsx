import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Save, X, CheckSquare, Square } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../services/api';
import { allNavCategories } from '../config/navigation';

export default function Permissions() {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const { addToast } = useToast();

    const fetchRoles = async () => {
        try {
            const { data } = await api.get('/roles');
            setRoles(data);
        } catch (error) {
            addToast('Error al cargar roles', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSelectRole = (role) => {
        setSelectedRole(role ? { ...role, permissions: role.permissions || [] } : { name: '', description: '', permissions: [] });
        setIsEditing(true);
    };

    const togglePermission = (path) => {
        if (!selectedRole) return;
        const currentPerms = selectedRole.permissions || [];
        const perms = currentPerms.includes(path)
            ? currentPerms.filter(p => p !== path)
            : [...currentPerms, path];
        setSelectedRole({ ...selectedRole, permissions: perms });
    };

    const toggleAllPermissions = () => {
        if (!selectedRole) return;
        const currentPerms = selectedRole.permissions || [];
        const allPaths = allNavCategories.flatMap(c => c.items.map(i => i.path));
        const hasAll = allPaths.every(path => currentPerms.includes(path));
        setSelectedRole({ 
            ...selectedRole, 
            permissions: hasAll ? [] : allPaths 
        });
    };

    const toggleCategoryPermissions = (categoryItems) => {
        if (!selectedRole) return;
        const currentPerms = selectedRole.permissions || [];
        const categoryPaths = categoryItems.map(i => i.path);
        const hasAllCategory = categoryPaths.every(path => currentPerms.includes(path));
        
        let newPerms;
        if (hasAllCategory) {
            newPerms = currentPerms.filter(p => !categoryPaths.includes(p));
        } else {
            const missingPerms = categoryPaths.filter(p => !currentPerms.includes(p));
            newPerms = [...currentPerms, ...missingPerms];
        }
        setSelectedRole({ ...selectedRole, permissions: newPerms });
    };

    const saveRole = async () => {
        if (!selectedRole.name.trim()) return addToast('El nombre del rol es requerido', 'warning');
        try {
            if (selectedRole.id) {
                await api.put(`/roles/${selectedRole.id}`, selectedRole);
                addToast('Rol actualizado exitosamente', 'success');
            } else {
                await api.post('/roles', selectedRole);
                addToast('Rol creado exitosamente', 'success');
            }
            setIsEditing(false);
            fetchRoles();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al guardar el rol', 'error');
        }
    };

    const deleteRole = async (id, name) => {
        if (name === 'Administrator') return addToast('No puedes eliminar el rol principal', 'warning');
        if (!window.confirm(`¿Estás seguro de eliminar el rol ${name}?`)) return;
        try {
            await api.delete(`/roles/${id}`);
            addToast('Rol eliminado', 'success');
            if (selectedRole?.id === id) setIsEditing(false);
            fetchRoles();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al eliminar', 'error');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 4rem)' }}>
            {/* Left Panel: Roles List */}
            <div className="card glass" style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                        <Shield size={24} color="var(--primary)" /> Roles
                    </h2>
                    <button onClick={() => handleSelectRole(null)} className="btn-primary" style={{ padding: '0.5rem', borderRadius: '50%' }} title="Nuevo Rol">
                        <Plus size={18} />
                    </button>
                </div>

                {loading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Cargando roles...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {roles.map(role => (
                            <div 
                                key={role.id} 
                                style={{ 
                                    padding: '1rem', 
                                    background: selectedRole?.id === role.id ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-color)', 
                                    border: `1px solid ${selectedRole?.id === role.id ? 'var(--primary)' : 'var(--border)'}`, 
                                    borderRadius: 'var(--border-radius)',
                                    cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}
                                onClick={() => handleSelectRole(role)}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{role.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{role.permissions?.length || 0} módulos accesibles</div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={(e) => { e.stopPropagation(); deleteRole(role.id, role.name); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Panel: Role Editor */}
            <div className="card glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {!isEditing ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '1rem' }}>
                        <Shield size={48} opacity={0.5} />
                        <p>Selecciona un rol para editar sus permisos de acceso o crea uno nuevo</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.25rem' }}>{selectedRole.id ? 'Editar Rol' : 'Nuevo Rol'}</h2>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => setIsEditing(false)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <X size={16} /> Cancelar
                                </button>
                                <button onClick={saveRole} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Save size={16} /> Guardar
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Nombre del Rol</label>
                                <input 
                                    type="text" 
                                    value={selectedRole.name} 
                                    onChange={e => setSelectedRole({...selectedRole, name: e.target.value})} 
                                    className="form-control" 
                                    placeholder="Ej. Gerente de Estación"
                                    disabled={selectedRole.name === 'Administrator'}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 2 }}>
                                <label>Descripción (Opcional)</label>
                                <input 
                                    type="text" 
                                    value={selectedRole.description || ''} 
                                    onChange={e => setSelectedRole({...selectedRole, description: e.target.value})} 
                                    className="form-control" 
                                    placeholder="Descripción del cargo o rol"
                                />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                <h3 style={{ fontSize: '1rem', margin: 0 }}>Módulos Mapeados Automáticamente</h3>
                                <button onClick={toggleAllPermissions} className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
                                    Marcar / Desmarcar Todos
                                </button>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                                Este panel se adapta en tiempo real a las opciones agregadas al sistema. Selecciona o deshabilita en qué menús tendrá visión y acceso este rol:
                            </p>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                {allNavCategories.filter(cat => cat.items.length > 0).map((category, idx) => (
                                    <div key={idx} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', margin: 0 }}>{category.title}</h4>
                                            <button onClick={(e) => { e.preventDefault(); toggleCategoryPermissions(category.items); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
                                                Todo el grupo
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {category.items.map(item => {
                                                const isChecked = selectedRole.permissions.includes(item.path);
                                                return (
                                                    <label key={item.path} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                        <div onClick={(e) => { e.preventDefault(); togglePermission(item.path); }}>
                                                            {isChecked ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="rgba(255,255,255,0.2)" />}
                                                        </div>
                                                        <span onClick={() => togglePermission(item.path)} style={{ userSelect: 'none' }}>
                                                            {item.name}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
