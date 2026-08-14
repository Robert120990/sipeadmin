import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import Modal from '../../../../components/Modal';
import { Landmark, FileText, Plus, Edit2, Save, Search, ChevronLeft, ChevronRight, Copy, Trash2 } from 'lucide-react';
import DesignerService from '../../services/DesignerService';

export default function FormatManager({ children, onEditMode, initialFormatId }) {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState('list'); // 'list' o 'editor'
    const [formats, setFormats] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const [showModal, setShowModal] = useState(false);
    const [editingFormat, setEditingFormat] = useState(null);
    const [formData, setFormData] = useState({ name: '', banco_id: '', description: '', width: 152.4, height: 69.85, orientation: 'horizontal' });

    useEffect(() => {
        fetchData();
        fetchBancos();
    }, []);

    // Si estamos en modo edición desde el router, cargamos ese formato
    useEffect(() => {
        if (initialFormatId) {
            onEditMode(initialFormatId);
        }
    }, [initialFormatId, onEditMode]);

    const fetchData = async () => {
        try {
            const data = await DesignerService.getFormats({ is_active: true });
            setFormats(data);
        } catch (err) {
            addToast('Error al cargar formatos', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchBancos = async () => {
        try {
            const data = await DesignerService.getBancos();
            setBancos(data);
        } catch (err) {
            addToast('Error al cargar bancos', 'error');
        }
    };

    const filteredFormats = useMemo(() => {
        if (!searchTerm) return formats;
        const lowSearch = searchTerm.toLowerCase();
        return formats.filter(f => f.name.toLowerCase().includes(lowSearch) || (f.banco_nombre || '').toLowerCase().includes(lowSearch));
    }, [formats, searchTerm]);

    const totalPages = Math.ceil(filteredFormats.length / itemsPerPage);
    const paginatedFormats = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredFormats.slice(start, start + itemsPerPage);
    }, [filteredFormats, currentPage]);

    useEffect(() => { setCurrentPage(1); }, [searchTerm]);

    const handleOpenModal = (format = null) => {
        if (format) {
            setEditingFormat(format);
            setFormData({ name: format.name, banco_id: format.banco_id, description: format.description, width: format.width, height: format.height, orientation: format.orientation });
        } else {
            setEditingFormat(null);
            setFormData({ name: '', banco_id: '', description: '', width: 152.4, height: 69.85, orientation: 'horizontal' });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingFormat) {
                await DesignerService.updateFormat(editingFormat.id, formData);
                addToast('Formato actualizado', 'success');
            } else {
                const result = await DesignerService.createFormat({...formData, design_json: { campos: [] }});
                addToast('Formato creado. Abriendo diseñador...', 'success');
                navigate(`/dashboard/bancos/check-designer/edit/${result.id}`);
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast('Error al guardar el formato', 'error');
        }
    };

    const handleEditDesign = (format) => {
        navigate(`/dashboard/bancos/check-designer/edit/${format.id}`);
    };
    
    const handleDuplicate = async (format) => {
        const newFormatData = {
            name: `${format.name} - Copia`,
            banco_id: format.banco_id,
            description: format.description,
            width: format.width,
            height: format.height,
            orientation: format.orientation,
            margin_top: format.margin_top,
            margin_right: format.margin_right,
            margin_bottom: format.margin_bottom,
            margin_left: format.margin_left,
            resolution: format.resolution,
            printer_name: format.printer_name,
            is_active: true,
            design_json: format.design_json,
        };
        try {
            await DesignerService.createFormat(newFormatData);
            addToast('Formato duplicado', 'success');
            fetchData();
        } catch(err) {
            addToast('Error al duplicar formato', 'error');
        }
    };

    const handleDelete = async (format) => {
        const confirmed = await confirm(
            `¿Estás seguro de eliminar el formato "${format.name}"?\n\nLos cheques de este banco dejarán de imprimirse con este formato.`,
            { title: 'Eliminar formato', variant: 'danger' }
        );
        if (!confirmed) return;
        try {
            await DesignerService.deleteFormat(format.id);
            addToast('Formato eliminado', 'success');
            fetchData();
        } catch (err) {
            addToast('Error al eliminar el formato', 'error');
        }
    };


    if (viewMode === 'editor') {
        return children;
    }

    if (loading) return <div className="p-8 text-center text-muted">Cargando formatos...</div>;

    return (
        <div style={{ padding: '2rem' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><FileText size={32} color="var(--primary)" />Diseñador de Impresión de Cheques</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Administre los formatos de impresión de cheques asociados a bancos.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" placeholder="Buscar formato..." style={{ paddingLeft: '3rem', width: '100%', minWidth: '200px' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button className="btn-primary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={() => handleOpenModal()}>
                        <Plus size={18} />Nuevo Formato
                    </button>
                </div>
            </div>

            <div className="card glass table-responsive">
                <table style={{ fontSize: '0.75rem', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Nombre</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Banco</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Descripción</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Estado</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedFormats.length === 0 && (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No se encontraron formatos.</td></tr>
                        )}
                        {paginatedFormats.map(f => (
                            <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.5rem 1rem', fontWeight: '500' }}>{f.name}</td>
                                <td style={{ padding: '0.5rem 1rem' }}>{f.banco_nombre || '-'}</td>
                                <td style={{ padding: '0.5rem 1rem' }}>{f.description || '-'}</td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                                    <span className={`badge ${f.is_active ? 'badge-active' : 'badge-inactive'}`}>{f.is_active ? 'Activo' : 'Inactivo'}</span>
                                </td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                        <button onClick={() => handleEditDesign(f)} style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} title="Editar Diseño"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDuplicate(f)} style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} title="Duplicar"><Copy size={16} /></button>
                                        <button onClick={() => handleOpenModal(f)} style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} title="Editar"><Save size={16} /></button>
                                        <button onClick={() => handleDelete(f)} style={{ background: 'none', color: 'var(--danger)', padding: '0.25rem' }} title="Eliminar"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Mostrando {paginatedFormats.length} de {filteredFormats.length} resultados</div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></button>
                            <span style={{ fontSize: '0.875rem', padding: '0 1rem' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}
            </div>

            <Modal open={showModal} onClose={() => setShowModal(false)} title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{editingFormat ? <Edit2 size={20} /> : <Plus size={20} />}{editingFormat ? 'Editar Formato' : 'Nuevo Formato'}</span>}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-grid form-grid-2">
                        <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nombre</label><input type="text" style={{ width: '100%' }} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                        <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Banco</label>
                            <select style={{ width: '100%' }} value={formData.banco_id} onChange={e => setFormData({...formData, banco_id: e.target.value})}>
                                <option value="">Seleccionar Banco</option>
                                {bancos.map(b => <option key={b.id} value={b.id}>{b.descripcion}</option>)}
                            </select>
                        </div>
                    </div>
                    <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Descripción</label><textarea style={{ width: '100%', minHeight: '60px' }} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                    <div className="form-grid form-grid-2">
                        <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Ancho (mm)</label><input type="number" step="0.1" value={formData.width} onChange={e => setFormData({...formData, width: parseFloat(e.target.value)})} /></div>
                        <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Alto (mm)</label><input type="number" step="0.1" value={formData.height} onChange={e => setFormData({...formData, height: parseFloat(e.target.value)})} /></div>
                    </div>
                    <div><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Orientación</label>
                        <select style={{ width: '100%' }} value={formData.orientation} onChange={e => setFormData({...formData, orientation: e.target.value})}>
                            <option value="horizontal">Horizontal (Landscape)</option>
                            <option value="vertical">Vertical (Portrait)</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}><Save size={18} />{editingFormat ? 'Actualizar' : 'Crear y Diseñar'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
