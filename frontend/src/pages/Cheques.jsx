import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { Hash, FileText, Search, Plus, Calendar, Filter, Save, Trash2, ChevronLeft, ChevronRight, Edit2, CheckCircle, DollarSign, User, Printer } from 'lucide-react';
import { todayStr } from '../utils/date';
import PrintEngine from '../modules/check-designer/services/PrintEngine';
import DesignerService from '../modules/check-designer/services/DesignerService';
import { numeroALetras, formatMonto, formatearFechaEnLetras, formatearFechaEnLetrasCorta } from '../utils/numeroALetras';
import { useNavigate } from 'react-router-dom';

export default function Cheques() {
    const [cheques, setCheques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const [cuentas, setCuentas] = useState([]);
    const [empresas, setEmpresas] = useState([]);

    const [filters, setFilters] = useState({
        id_empresa: '',
        numero_cuenta: '',
        desde: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
        hasta: todayStr()
    });

    const [formData, setFormData] = useState({
        id_empresa: '',
        numero_cuenta: '',
        fecha: todayStr(),
        fecha_aplicado: '',
        cheque: '',
        valor: '',
        a_nombre: '',
        concepto: '',
        num_partida: '',
        cheque_anulado: false,
        es_reservado: false,
        es_pago_contado: false,
        fue_noemitido: false
    });

    const [editingCheque, setEditingCheque] = useState(null);
    const originalValues = useRef({ valor: '', a_nombre: '', concepto: '' });
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const navigate = useNavigate();

    useEffect(() => {
        fetchInitialCatalogs();
    }, []);

    useEffect(() => {
        fetchCheques();
    }, []);

    const fetchInitialCatalogs = async () => {
        try {
            const res = await api.get('/cheques/catalogos');
            setCuentas(res.data.cuentas || []);
            setEmpresas(res.data.empresas || []);
        } catch (err) {
            addToast('Error al cargar catálogos', 'error');
        }
    };

    const fetchCheques = async () => {
        setLoading(true);
        try {
            const res = await api.get('/cheques', { params: filters });
            setCheques(res.data);
        } catch (err) {
            addToast('Error al cargar historial de cheques', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCatalogsForCompany = async (id_empresa) => {
        if (!id_empresa) return;
        try {
            const res = await api.get(`/cheques/catalogos?id_empresa=${id_empresa}`);
            setCuentas(res.data.cuentas || []);
        } catch (err) {
            addToast('Error al cargar cuentas para la empresa', 'error');
        }
    };

    const handleCompanyChange = (id_empresa) => {
        setFormData(prev => ({ ...prev, id_empresa, numero_cuenta: '' }));
        if (id_empresa) fetchCatalogsForCompany(id_empresa);
    };

    const handleOpenModal = async (cheque = null) => {
        if (cheque) {
            setEditingCheque(cheque);
            const formatDateForInput = (str) => {
                if (!str) return '';
                const parts = str.split('/');
                if (parts.length !== 3) return '';
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            };

            setFormData({
                id_empresa: cheque.id_empresa,
                numero_cuenta: cheque.numero_cuenta,
                fecha: formatDateForInput(cheque.fecha),
                fecha_aplicado: formatDateForInput(cheque.fecha_aplicado),
                cheque: cheque.cheque || '',
                valor: cheque.valor || '',
                a_nombre: cheque.a_nombre || '',
                concepto: cheque.concepto || '',
                num_partida: cheque.num_partida || '',
                cheque_anulado: !!cheque.cheque_anulado,
                es_reservado: !!cheque.es_reservado,
                es_pago_contado: !!cheque.es_pago_contado,
                fue_noemitido: !!cheque.fue_noemitido
            });
            await fetchCatalogsForCompany(cheque.id_empresa);
        } else {
            setEditingCheque(null);
            setFormData({
                id_empresa: '',
                numero_cuenta: '',
                fecha: todayStr(),
                fecha_aplicado: '',
                cheque: '',
                valor: '',
                a_nombre: '',
                concepto: '',
                num_partida: '',
                cheque_anulado: false,
                es_reservado: false,
                es_pago_contado: false,
                fue_noemitido: false
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCheque) {
                await api.put(`/cheques/${editingCheque.id}`, formData);
                addToast('Cheque actualizado con éxito', 'success');
            } else {
                await api.post('/cheques', formData);
                addToast('Cheque registrado con éxito', 'success');
            }
            setShowModal(false);
            fetchCheques();
        } catch (err) {
            addToast(`Error al ${editingCheque ? 'actualizar' : 'registrar'} cheque`, 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!await confirm('¿Está seguro de eliminar este cheque?', { variant: 'danger' })) return;
        try {
            await api.delete(`/cheques/${id}`);
            addToast('Cheque eliminado', 'success');
            fetchCheques();
        } catch (err) {
            addToast('Error al eliminar cheque', 'error');
        }
    };

    const handlePrint = async (cheque) => {
        try {
            if (!cheque.banco_id) {
                addToast('El cheque no tiene banco asociado', 'warning');
                return;
            }

            // Verificar que exista un formato de impresión guardado para el banco
            // El banco puede tener varios ids (uno por empresa): se busca por id y, si no,
            // por la descripción del banco (ej. "PROMERICA" con banco_id 641 vs 643).
            let formats = await DesignerService.getFormats({ banco_id: cheque.banco_id, is_active: true });
            if (!Array.isArray(formats) || formats.length === 0) {
                formats = await DesignerService.getFormats({ banco_nombre: cheque.banco_nombre, is_active: true });
            }
            const formato = Array.isArray(formats) ? formats.find(f => f.is_active !== false) || formats[0] : null;

            if (!formato) {
                const irAlDisenador = await confirm(
                    `No existe un formato de impresión guardado para el banco "${cheque.banco_nombre || cheque.banco_id}".\n\nDebe crear un formato en el Diseñador de Cheques antes de imprimir.`,
                    { title: 'Formato no encontrado', confirmText: 'Ir al Diseñador', cancelText: 'Cancelar', variant: 'primary' }
                );
                if (irAlDisenador) navigate('/dashboard/bancos/check-designer');
                return;
            }

            const user = JSON.parse(localStorage.getItem('user')) || {};
            const partesFecha = (cheque.fecha || '').split('/');
            const datos = {
                fecha: cheque.fecha || '',
                fecha_letras: formatearFechaEnLetras(cheque.fecha),
                fecha_letras_corta: formatearFechaEnLetrasCorta(cheque.fecha),
                dia: partesFecha[0] || '',
                mes: partesFecha[1] || '',
                anio: partesFecha[2] || '',
                anio_corto: (partesFecha[2] || '').slice(-2),
                beneficiario: cheque.a_nombre || '',
                monto_numeros: `*****${formatMonto(cheque.valor)}`,
                monto_letras: `*****${numeroALetras(cheque.valor)}*****`,
                concepto: cheque.concepto || '',
                numero_cheque: cheque.cheque || cheque.llave || '',
                ciudad: '',
                empresa: cheque.empresa_nombre || '',
                cuenta_bancaria: cheque.cuenta_nombre ? `${cheque.cuenta_nombre} - ${cheque.numero_cuenta}` : (cheque.numero_cuenta || ''),
                usuario_impresion: user.nombre || user.username || '',
                sucursal: '',
                observaciones: '',
            };

            await PrintEngine.printCheck(formato, formato.design_json?.campos || [], datos, formato.printer_name || null);
        } catch (err) {
            addToast('Error al imprimir cheque', 'error');
        }
    };

    const filteredCheques = useMemo(() => {
        if (!searchTerm) return cheques;
        const lowSearch = searchTerm.toLowerCase();
        return cheques.filter(c =>
            (c.concepto || '').toLowerCase().includes(lowSearch) ||
            (c.cheque || '').toLowerCase().includes(lowSearch) ||
            (c.a_nombre || '').toLowerCase().includes(lowSearch) ||
            (c.llave || '').toLowerCase().includes(lowSearch)
        );
    }, [cheques, searchTerm]);

    const totalPages = Math.ceil(filteredCheques.length / itemsPerPage);
    const paginatedCheques = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCheques.slice(start, start + itemsPerPage);
    }, [filteredCheques, currentPage]);

    const getEstadoBadges = (c) => {
        const badges = [];
        if (c.cheque_anulado) badges.push({ label: 'Anulado', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' });
        if (c.es_reservado) badges.push({ label: 'Reservado', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' });
        if (c.fue_noemitido) badges.push({ label: 'No Emitido', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' });
        if (c.es_pago_contado) badges.push({ label: 'Contado', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' });
        return badges;
    };

    const ToggleSwitch = ({ checked, onChange, disabled }) => (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            style={{
                position: 'relative',
                width: '44px',
                height: '22px',
                minHeight: 0,
                background: checked ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '11px',
                cursor: disabled ? 'default' : 'pointer',
                transition: 'background 0.3s',
                padding: 0,
                opacity: disabled ? 0.5 : 1
            }}
        >
            <div style={{
                position: 'absolute',
                top: '2px',
                left: checked ? '24px' : '2px',
                width: '18px',
                height: '18px',
                background: 'white',
                borderRadius: '50%',
                transition: 'left 0.3s'
            }} />
        </button>
    );

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <DollarSign size={32} color="var(--primary)" />
                        Cheques
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Historial e ingreso de cheques emitidos.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Plus size={18} />
                        Nuevo Cheque
                    </button>
                </div>
            </div>

            <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Empresa</label>
                        <select
                            style={{ width: '100%' }}
                            value={filters.id_empresa}
                            onChange={e => setFilters({...filters, id_empresa: e.target.value, numero_cuenta: ''})}
                        >
                            <option value="">Todas las empresas</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta</label>
                        <select
                            style={{ width: '100%' }}
                            value={filters.numero_cuenta}
                            onChange={e => setFilters({...filters, numero_cuenta: e.target.value})}
                        >
                            <option value="">Todas las cuentas</option>
                            {cuentas.filter(c => !filters.id_empresa || c.id_empresa === filters.id_empresa).map(acc => (
                                <option key={acc.corr} value={acc.numero}>{acc.banco_nombre} - {acc.numero}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde</label>
                        <input type="date" value={filters.desde} onChange={e => setFilters({...filters, desde: e.target.value})} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta</label>
                        <input type="date" value={filters.hasta} onChange={e => setFilters({...filters, hasta: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" placeholder="Buscar en resultados..." style={{ paddingLeft: '2.5rem', width: '100%' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <button className="btn-secondary" onClick={() => fetchCheques()} title="Actualizar">
                            <Filter size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="card glass table-responsive">
                <table style={{ fontSize: '0.75rem', width: '100%', minWidth: '1000px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Fecha</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Cheque #</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Cuenta</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>A Nombre</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Concepto</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Valor</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Estado</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando cheques...</td></tr>
                        ) : paginatedCheques.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No se encontraron cheques para los filtros seleccionados.</td></tr>
                        ) : paginatedCheques.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} className="hover-row">
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div>{c.fecha}</div>
                                    {c.fecha_aplicado && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Apl: {c.fecha_aplicado}</div>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>{c.cheque || '-'}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.llave}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ fontWeight: '500' }}>{c.numero_cuenta}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.empresa_nombre}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', maxWidth: '180px' }}>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.a_nombre}>
                                        {c.a_nombre || '-'}
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', maxWidth: '250px' }} title={c.concepto}>
                                    <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.concepto}</div>
                                    {c.banco_nombre && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{c.banco_nombre}</div>}
                                    {c.num_partida && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Pda: {c.num_partida}</span>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: c.cheque_anulado ? 'rgba(255,255,255,0.3)' : 'var(--text)', fontWeight: 'bold' }}>
                                    <span style={{ textDecoration: c.cheque_anulado ? 'line-through' : 'none' }}>
                                        ${parseFloat(c.valor || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {getEstadoBadges(c).map((b, i) => (
                                            <span key={i} className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', color: b.color, background: b.bg, border: `1px solid ${b.color}40` }}>
                                                {b.label}
                                            </span>
                                        ))}
                                        {getEstadoBadges(c).length === 0 && (
                                            <span className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', color: 'var(--success)', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                Emitido
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                        <button onClick={() => handlePrint(c)} style={{ background: 'none', color: 'var(--primary)', padding: '0.25rem' }} title="Imprimir cheque">
                                            <Printer size={16} />
                                        </button>
                                        {c.es_contabilizado !== 'S' ? (
                                            <>
                                                <button onClick={() => handleOpenModal(c)} style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem' }} title="Editar">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(c.id)} style={{ background: 'none', color: '#ef4444', padding: '0.25rem' }} title="Eliminar">
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        ) : (
                                            <span title="Contabilizado - No se puede editar ni eliminar">
                                                <CheckCircle size={16} color="var(--success)" />
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Mostrando {paginatedCheques.length} de {filteredCheques.length} cheques
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></button>
                            <span style={{ fontSize: '0.8rem' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                            <button className="btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>{editingCheque ? <Edit2 size={20} color="var(--primary)" /> : <Plus size={20} color="var(--primary)" />}{editingCheque ? 'Editar Cheque' : 'Nuevo Cheque'}</span>}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa</label>
                            <select style={{ width: '100%' }} value={formData.id_empresa} onChange={e => handleCompanyChange(e.target.value)} required>
                                <option value="">Seleccione Empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No. Partida</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" style={{ paddingLeft: '3rem' }} placeholder="Partida" value={formData.num_partida} onChange={e => setFormData({...formData, num_partida: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cuenta Bancaria</label>
                        <select style={{ width: '100%' }} value={formData.numero_cuenta} onChange={e => setFormData({...formData, numero_cuenta: e.target.value})} disabled={!formData.id_empresa} required>
                            <option value="">Seleccione Cuenta...</option>
                            {cuentas.filter(c => c.id_empresa === formData.id_empresa).map(c => (
                                <option key={c.corr} value={c.numero}>{c.nombre} - {c.numero}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '3rem' }} value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha Aplicado</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '3rem' }} value={formData.fecha_aplicado} onChange={e => setFormData({...formData, fecha_aplicado: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cheque #</label>
                            <div style={{ position: 'relative' }}>
                                <Hash size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" style={{ paddingLeft: '3rem' }} placeholder="Número de cheque" value={formData.cheque} onChange={e => setFormData({...formData, cheque: e.target.value})} required />
                            </div>
                        </div>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Valor ($)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem' }}>$</span>
                                <input type="number" step="0.01" placeholder="0.00" style={{ paddingLeft: '2.5rem', fontSize: '1.25rem', fontWeight: 'bold', color: formData.cheque_anulado ? 'rgba(255,255,255,0.3)' : 'var(--primary)', textDecoration: formData.cheque_anulado ? 'line-through' : 'none' }} value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} onFocus={(e) => e.target.select()} disabled={formData.cheque_anulado} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>A Nombre</label>
                        <div style={{ position: 'relative' }}>
                            <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" style={{ paddingLeft: '3rem', color: formData.cheque_anulado ? 'var(--danger)' : 'var(--text)' }} placeholder="Beneficiario del cheque" value={formData.a_nombre} onChange={e => setFormData({...formData, a_nombre: e.target.value})} disabled={formData.cheque_anulado} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Concepto</label>
                        <input type="text" placeholder="Descripción del cheque..." style={{ width: '100%', textTransform: 'uppercase', color: formData.cheque_anulado ? 'var(--danger)' : 'var(--text)' }} value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value.toUpperCase()})} disabled={formData.cheque_anulado} />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Estado del Cheque</label>
                        <div className="form-grid form-grid-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch checked={formData.cheque_anulado} onChange={v => {
                                    setFormData(prev => {
                                        if (v) {
                                            originalValues.current = { valor: prev.valor, a_nombre: prev.a_nombre, concepto: prev.concepto };
                                            return { ...prev, cheque_anulado: true, valor: '0', a_nombre: '***** CHEQUE ANULADO *****', concepto: '***** CHEQUE ANULADO *****' };
                                        }
                                        return { ...prev, cheque_anulado: false, valor: originalValues.current.valor, a_nombre: originalValues.current.a_nombre, concepto: originalValues.current.concepto };
                                    });
                                }} />
                                <span style={{ fontSize: '0.8rem', color: formData.cheque_anulado ? '#ef4444' : 'var(--text-muted)' }}>Anulado</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch checked={formData.fue_noemitido} onChange={v => setFormData({...formData, fue_noemitido: v})} />
                                <span style={{ fontSize: '0.8rem', color: formData.fue_noemitido ? '#6b7280' : 'var(--text-muted)' }}>No Emitido</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={18} />
                            {editingCheque ? 'Actualizar Cheque' : 'Guardar Cheque'}
                        </button>
                    </div>
                </form>
            </Modal>

            <style dangerouslySetInnerHTML={{ __html: `
                .hover-row:hover { background: rgba(255,255,255,0.03); }
                input[type="date"] { color-scheme: dark; }
            `}} />
        </div>
    );
}
