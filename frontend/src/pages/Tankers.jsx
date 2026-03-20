import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Container, Edit2, Trash2, X, Save, Plus, Minus } from 'lucide-react';

export default function Tankers() {
    const [tankers, setTankers] = useState([]);
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTanker, setEditingTanker] = useState(null);
    const [formData, setFormData] = useState({ code: '', carrier_id: '' });
    const [compartments, setCompartments] = useState([{ number: 1, capacity: '' }]);
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [tankersRes, carriersRes] = await Promise.all([
                api.get('/tankers'),
                api.get('/carriers')
            ]);
            setTankers(tankersRes.data);
            setCarriers(carriersRes.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar datos', 'error');
        }
    };

    const handleOpenModal = (tanker = null) => {
        if (tanker) {
            setEditingTanker(tanker);
            setFormData({ code: tanker.code, carrier_id: tanker.carrier_id || '' });
            setCompartments(typeof tanker.compartments === 'string' ? JSON.parse(tanker.compartments) : (tanker.compartments || [{ number: 1, capacity: '' }]));
        } else {
            setEditingTanker(null);
            setFormData({ code: '', carrier_id: carriers[0]?.id || '' });
            setCompartments([{ number: 1, capacity: '' }]);
        }
        setShowModal(true);
    };

    const handleAddCompartment = () => {
        setCompartments([...compartments, { number: compartments.length + 1, capacity: '' }]);
    };

    const handleRemoveCompartment = (index) => {
        const newComps = compartments.filter((_, i) => i !== index).map((c, i) => ({ ...c, number: i + 1 }));
        setCompartments(newComps);
    };

    const handleCompChange = (index, value) => {
        const newComps = [...compartments];
        newComps[index].capacity = value;
        setCompartments(newComps);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Validar que los compartimientos tengan capacidad numérica válida
        const validCompartments = compartments.map(c => ({ number: c.number, capacity: parseFloat(c.capacity) }));
        if (validCompartments.some(c => isNaN(c.capacity) || c.capacity <= 0)) {
            return addToast('La capacidad de los compartimientos debe ser mayor a 0', 'error');
        }

        const payload = { ...formData, compartments: validCompartments };
        
        try {
            if (editingTanker) {
                await api.put(`/tankers/${editingTanker.id}`, payload);
                addToast('Pipa actualizada', 'success');
            } else {
                await api.post('/tankers', payload);
                addToast('Pipa creada', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de eliminar esta pipa?')) {
            try {
                await api.delete(`/tankers/${id}`);
                addToast('Pipa eliminada', 'success');
                fetchData();
            } catch (err) {
                addToast('Error al eliminar', 'error');
            }
        }
    };

    // Calculate total capacity
    const getTotalCapacity = (comps) => {
        let parsed = typeof comps === 'string' ? JSON.parse(comps) : (comps || []);
        return parsed.reduce((acc, curr) => acc + (parseFloat(curr.capacity) || 0), 0);
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Pipas y Compartimientos</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Catálogo de unidades de transporte y sus capacidades.</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Container size={18} />
                    Nueva Pipa
                </button>
            </div>

            <div className="card glass">
                <table>
                    <thead>
                        <tr>
                            <th>Código/Placa</th>
                            <th>Transportista</th>
                            <th>Núm. Compartimientos</th>
                            <th>Capacidad Total</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tankers.map(t => {
                            const compsArray = typeof t.compartments === 'string' ? JSON.parse(t.compartments) : (t.compartments || []);
                            return (
                            <tr key={t.id}>
                                <td style={{ fontWeight: '500' }}>{t.code}</td>
                                <td>{t.carrier_desc || 'N/A'}</td>
                                <td>{compsArray.length}</td>
                                <td>{getTotalCapacity(t.compartments).toLocaleString()} Gal</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => handleOpenModal(t)} style={{ background: 'none', color: 'var(--text-muted)' }} title="Editar">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(t.id)} style={{ background: 'none', color: 'var(--danger)' }} title="Eliminar">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )})}
                        {tankers.length === 0 && (
                            <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay pipas registradas.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', overflow: 'auto', padding: '2rem' }}>
                    <div className="card glass" style={{ width: '500px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2>{editingTanker ? 'Editar Pipa' : 'Nueva Pipa'}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Código / Placa</label>
                                    <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} required placeholder="Ej. PIP-01" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Transportista</label>
                                    <select 
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                        value={formData.carrier_id}
                                        onChange={e => setFormData({...formData, carrier_id: e.target.value})}
                                        required
                                    >
                                        <option value="" disabled>Seleccionar...</option>
                                        {carriers.map(c => <option key={c.id} value={c.id}>{c.description} ({c.code})</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1rem' }}>Compartimientos</h3>
                                    <button type="button" onClick={handleAddCompartment} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(37, 99, 235, 0.2)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>
                                        <Plus size={14} /> Agregar
                                    </button>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {compartments.map((comp, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)' }}>
                                            <span style={{ fontWeight: 'bold', width: '30px', color: 'var(--text-muted)' }}>#{comp.number}</span>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <input 
                                                    type="number" 
                                                    value={comp.capacity} 
                                                    onChange={(e) => handleCompChange(i, e.target.value)} 
                                                    placeholder="Capacidad en Galones" 
                                                    required 
                                                    min="1"
                                                />
                                                <span style={{ position: 'absolute', right: '12px', top: '12px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Gal</span>
                                            </div>
                                            <button type="button" onClick={() => handleRemoveCompartment(i)} disabled={compartments.length === 1} style={{ background: 'none', border: 'none', color: compartments.length === 1 ? 'var(--border)' : 'var(--danger)', padding: '4px', cursor: compartments.length === 1 ? 'not-allowed' : 'pointer' }}>
                                                <Minus size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '1rem', textAlign: 'right', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Capacidad Total: <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                                        {compartments.reduce((sum, c) => sum + (parseFloat(c.capacity) || 0), 0).toLocaleString()} Gal
                                    </span>
                                </div>
                            </div>

                            <button type="submit" className="btn-primary" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                <Save size={18} /> {editingTanker ? 'Actualizar' : 'Guardar'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
