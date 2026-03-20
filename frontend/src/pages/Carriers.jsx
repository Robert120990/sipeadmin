import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Truck, Edit2, Trash2, X, Save } from 'lucide-react';

export default function Carriers() {
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingCarrier, setEditingCarrier] = useState(null);
    const [formData, setFormData] = useState({ code: '', description: '' });
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const res = await api.get('/carriers');
            setCarriers(res.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar transportistas', 'error');
        }
    };

    const handleOpenModal = (carrier = null) => {
        if (carrier) {
            setEditingCarrier(carrier);
            setFormData({ code: carrier.code, description: carrier.description || '' });
        } else {
            setEditingCarrier(null);
            setFormData({ code: '', description: '' });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCarrier) {
                await api.put(`/carriers/${editingCarrier.id}`, formData);
                addToast('Transportista actualizado', 'success');
            } else {
                await api.post('/carriers', formData);
                addToast('Transportista creado', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de eliminar este transportista?')) {
            try {
                await api.delete(`/carriers/${id}`);
                addToast('Transportista eliminado', 'success');
                fetchData();
            } catch (err) {
                addToast(err.response?.data?.message || 'Error al eliminar', 'error');
            }
        }
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Transportistas</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Catálogo de empresas de transporte.</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Truck size={18} />
                    Nuevo Transportista
                </button>
            </div>

            <div className="card glass">
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Descripción</th>
                            <th>Registro</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {carriers.map(c => (
                            <tr key={c.id}>
                                <td style={{ fontWeight: '500', color: 'var(--primary)' }}>{c.code}</td>
                                <td>{c.description}</td>
                                <td style={{ color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => handleOpenModal(c)} style={{ background: 'none', color: 'var(--text-muted)' }} title="Editar">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(c.id)} style={{ background: 'none', color: 'var(--danger)' }} title="Eliminar">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {carriers.length === 0 && (
                            <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay transportistas registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div className="card glass" style={{ width: '400px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2>{editingCarrier ? 'Editar Transportista' : 'Nuevo Transportista'}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Código</label>
                                <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} required placeholder="Ej. TR-001" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Descripción / Nombre</label>
                                <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required placeholder="Nombre de la empresa" />
                            </div>
                            <button type="submit" className="btn-primary" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                <Save size={18} /> {editingCarrier ? 'Actualizar' : 'Guardar'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
