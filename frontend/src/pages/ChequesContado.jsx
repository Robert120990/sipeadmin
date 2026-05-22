import React, { useState, useEffect } from 'react';
import { Search, FileText, CheckCircle, X, CreditCard } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const ToggleSwitch = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
            position: 'relative',
            width: '44px',
            height: '22px',
            background: checked ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '11px',
            cursor: 'pointer',
            transition: 'background 0.3s',
            padding: 0
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

const ChequesContado = () => {
    const { addToast } = useToast();
    const [estaciones, setEstaciones] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [estacion, setEstacion] = useState('');
    const [soloPendientes, setSoloPendientes] = useState(true);
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedSolicitud, setSelectedSolicitud] = useState(null);
    const [chequeNum, setChequeNum] = useState('');
    const [cuentaSelected, setCuentaSelected] = useState('');

    useEffect(() => {
        fetchEstaciones();
        fetchCuentas();
    }, []);

    const fetchEstaciones = async () => {
        try {
            const res = await api.get('/cheques/contado/estaciones');
            setEstaciones(res.data || []);
        } catch (e) {
            addToast('Error al cargar estaciones', 'error');
        }
    };

    const fetchCuentas = async () => {
        try {
            const res = await api.get('/cheques/contado/cuentas');
            setCuentas(res.data || []);
        } catch (e) {
            console.error('Error al cargar cuentas:', e);
        }
    };

    const handleConsultar = async () => {
        if (!estacion) return addToast('Seleccione una estación', 'error');
        setLoading(true);
        try {
            const res = await api.get('/cheques/contado/solicitudes', {
                params: { estacion, pendientes: soloPendientes ? '1' : '0' }
            });
            setSolicitudes(res.data || []);
        } catch (e) {
            addToast('Error al consultar solicitudes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const openGenerarModal = (sol) => {
        setSelectedSolicitud(sol);
        setChequeNum('');
        setCuentaSelected('');
        setShowModal(true);
    };

    const handleGenerar = async () => {
        if (!cuentaSelected) return addToast('Seleccione una cuenta bancaria', 'error');
        if (!chequeNum.trim()) return addToast('Ingrese el número de cheque', 'error');

        const cuenta = cuentas.find(c => String(c.corr) === String(cuentaSelected));
        if (!cuenta) return addToast('Cuenta no encontrada', 'error');

        try {
            await api.post('/cheques/contado/generar', {
                llave: selectedSolicitud.llave,
                id_empresa: cuenta.empresa_codigo,
                numero_cuenta: cuenta.numero,
                cheque_num: chequeNum.trim(),
                fecha: selectedSolicitud.fecha,
                valor: selectedSolicitud.monto,
                a_nombre: selectedSolicitud.nombre,
                concepto: 'PAGO A PROVEEDOR (CONTADO)'
            });
            addToast('Cheque generado exitosamente', 'success');
            setShowModal(false);
            handleConsultar();
        } catch (e) {
            addToast('Error al generar cheque', 'error');
        }
    };

    const fmtMonto = (val) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
    };

    const fmtFecha = (val) => {
        if (!val) return '';
        const d = typeof val === 'string' ? val.split('T')[0] : val;
        const parts = d.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return d;
    };

    const isPending = (sol) => !sol.num_cheque || sol.num_cheque.trim() === '';

    return (
        <div style={{ padding: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}>Emisión de Cheques de Contado</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Generar cheques a partir de solicitudes de pago de contado.</p>
                </div>
            </div>

            <div className="card glass" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ESTACIÓN</label>
                    <select value={estacion} onChange={e => setEstacion(e.target.value)} style={{ minWidth: '250px' }}>
                        <option value="">Seleccione...</option>
                        {estaciones.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.id} - {emp.nombre}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <ToggleSwitch checked={soloPendientes} onChange={setSoloPendientes} />
                    <span style={{ fontSize: '0.85rem', color: soloPendientes ? 'var(--primary)' : 'var(--text-muted)' }}>
                        Solo pendientes
                    </span>
                </div>

                <button onClick={handleConsultar} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Search size={18} /> Consultar
                </button>
            </div>

            <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Proveedor</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Nombre</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Monto</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Entrega</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>No. CCF</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>No. Cheque</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '4rem', textAlign: 'center' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Consultando solicitudes...</p>
                                    </td>
                                </tr>
                            ) : solicitudes.length > 0 ? (
                                solicitudes.map((sol, idx) => (
                                    <tr key={idx} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.65rem 1rem' }}>{fmtFecha(sol.fecha)}</td>
                                        <td style={{ padding: '0.65rem 1rem' }}>{sol.cod_proveedor}</td>
                                        <td style={{ padding: '0.65rem 1rem' }}>{sol.nombre}</td>
                                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{fmtMonto(sol.monto)}</td>
                                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem' }}>{fmtFecha(sol.fecha_entrega)}</td>
                                        <td style={{ padding: '0.65rem 1rem' }}>{sol.num_ccf}</td>
                                        <td style={{ padding: '0.65rem 1rem' }}>
                                            {isPending(sol) ? (
                                                <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>PENDIENTE</span>
                                            ) : (
                                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{sol.num_cheque}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                            {isPending(sol) ? (
                                                <button onClick={() => openGenerarModal(sol)} className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <CreditCard size={14} /> Generar
                                                </button>
                                            ) : (
                                                <CheckCircle size={18} color="var(--success)" />
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Search size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No se encontraron solicitudes.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && selectedSolicitud && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
                    <div className="card glass" style={{ width: '550px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                                <CreditCard size={24} color="var(--primary)" />
                                Generar Cheque de Contado
                            </h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha</label>
                                    <input type="text" value={fmtFecha(selectedSolicitud.fecha)} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto</label>
                                    <input type="text" value={fmtMonto(selectedSolicitud.monto)} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Beneficiario</label>
                                <input type="text" value={selectedSolicitud.nombre} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta Bancaria *</label>
                                <select value={cuentaSelected} onChange={e => setCuentaSelected(e.target.value)} style={{ width: '100%' }}>
                                    <option value="">Seleccione cuenta...</option>
                                    {cuentas.map(c => (
                                        <option key={c.corr} value={c.corr}>
                                            {c.banco} | {c.numero} | {c.nombre} ({c.empresa_nombre})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No. Cheque *</label>
                                <input type="text" value={chequeNum} onChange={e => setChequeNum(e.target.value)} placeholder="Número de cheque" style={{ width: '200px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Concepto</label>
                                <input type="text" value="PAGO A PROVEEDOR (CONTADO)" readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '0.6rem 2rem' }}>Cancelar</button>
                                <button onClick={handleGenerar} className="btn-primary" style={{ padding: '0.6rem 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle size={16} /> Generar Cheque
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChequesContado;
