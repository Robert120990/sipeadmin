import React, { useState, useEffect } from 'react';
import { Search, FileText, CheckCircle, CreditCard, RefreshCw, Check, Unlink, Edit2 } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

const ToggleSwitch = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
            position: 'relative',
            width: '44px',
            height: '22px',
            minHeight: 0,
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
    const { confirm } = useConfirm();
    const [estaciones, setEstaciones] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [estacion, setEstacion] = useState('');
    const [soloPendientes, setSoloPendientes] = useState(true);
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('asignar'); // 'asignar' | 'generar'
    const [selectedSolicitud, setSelectedSolicitud] = useState(null);
    const [chequeNum, setChequeNum] = useState('');
    const [cuentaSelected, setCuentaSelected] = useState('');
    const [registrarEnBancos, setRegistrarEnBancos] = useState(false);

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

    const openModal = (sol, mode = 'asignar') => {
        setSelectedSolicitud(sol);
        setModalMode(mode);
        setChequeNum(sol.num_cheque && sol.num_cheque.trim() !== '' ? sol.num_cheque.trim() : '');
        setCuentaSelected('');
        setRegistrarEnBancos(false);
        setShowModal(true);
    };

    const handleGuardarAsignar = async () => {
        if (!chequeNum.trim()) return addToast('Ingrese el número de cheque', 'error');
        if (registrarEnBancos && !cuentaSelected) {
            return addToast('Seleccione la cuenta bancaria para registrar en bancos', 'error');
        }

        try {
            await api.post('/cheques/contado/marcar-emitido', {
                llave: selectedSolicitud.llave,
                id_empresa: estacion,
                cheque_num: chequeNum.trim(),
                cuenta_bancaria_id: registrarEnBancos ? cuentaSelected : null,
                registrar_en_bancos: registrarEnBancos
            });
            addToast(`Solicitud marcada con el cheque #${chequeNum.trim()}`, 'success');
            setShowModal(false);
            handleConsultar();
        } catch (e) {
            addToast('Error al asignar cheque', 'error');
        }
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

    const handleDesvincular = async (sol) => {
        const ok = await confirm(
            `¿Está seguro de desvincular el cheque #${sol.num_cheque} de la solicitud de ${sol.nombre || 'este proveedor'}?\n\nLa solicitud volverá al estado PENDIENTE.`,
            { variant: 'danger', title: 'Desvincular Cheque' }
        );
        if (!ok) return;

        try {
            await api.post('/cheques/contado/desvincular', {
                llave: sol.llave,
                id_empresa: estacion
            });
            addToast('Cheque desvinculado exitosamente', 'success');
            handleConsultar();
        } catch (e) {
            addToast('Error al desvincular cheque', 'error');
        }
    };

    const handleSincronizarEmitidos = async () => {
        if (!estacion) return addToast('Seleccione una estación primero', 'error');
        setSyncing(true);
        try {
            const res = await api.post('/cheques/contado/sincronizar-emitidos', { estacion });
            if (res.data?.syncedCount > 0) {
                addToast(res.data.message || `Se sincronizaron ${res.data.syncedCount} cheques`, 'success');
            } else {
                addToast(res.data?.message || 'No se encontraron cheques coincidentes para sincronizar', 'info');
            }
            handleConsultar();
        } catch (e) {
            addToast('Error al sincronizar cheques emitidos', 'error');
        } finally {
            setSyncing(false);
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
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}>Emisión de Cheques de Contado</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Generar cheques a partir de solicitudes de pago de contado.</p>
                </div>
            </div>

            <div className="card glass" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>ESTACIÓN</label>
                    <select value={estacion} onChange={e => setEstacion(e.target.value)} style={{ width: '100%', maxWidth: '280px', height: '36px', fontSize: '0.825rem' }}>
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

                <button onClick={handleConsultar} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}>
                    <Search size={16} /> Consultar
                </button>

                <button
                    onClick={handleSincronizarEmitidos}
                    disabled={syncing || !estacion}
                    className="btn-secondary"
                    title="Detecta automáticamente cheques ya emitidos en el libro de bancos y los vincula"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        height: '36px',
                        padding: '0 1rem',
                        fontSize: '0.825rem',
                        opacity: syncing ? 0.7 : 1,
                        cursor: syncing || !estacion ? 'not-allowed' : 'pointer'
                    }}
                >
                    <RefreshCw size={15} className={syncing ? 'spin' : ''} />
                    {syncing ? 'Sincronizando...' : 'Sincronizar Emitidos'}
                </button>

                {solicitudes.length > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>Total: <strong style={{ color: 'var(--text)' }}>{solicitudes.length}</strong></span>
                        <span>Suma: <strong style={{ color: 'var(--primary)' }}>{fmtMonto(solicitudes.reduce((acc, s) => acc + Number(s.monto || 0), 0))}</strong></span>
                    </div>
                )}
            </div>

            <div className="card glass table-responsive">
                <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Proveedor</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Nombre</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', width: '30px' }}>D</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Monto</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Entrega</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>No. CCF</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>No. Cheque</th>
                            <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center' }}>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '3rem', textAlign: 'center' }}>
                                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Consultando solicitudes...</p>
                                </td>
                            </tr>
                        ) : solicitudes.length > 0 ? (
                            solicitudes.map((sol, idx) => (
                                <tr key={sol.llave || idx} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{fmtFecha(sol.fecha)}</td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>{sol.cod_proveedor}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sol.nombre}>{sol.nombre}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>{(sol.tipo_destino || '')?.charAt(0) || '-'}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{fmtMonto(sol.monto)}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmtFecha(sol.fecha_entrega)}</td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>{sol.num_ccf}</td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        {isPending(sol) ? (
                                            <span style={{ color: 'var(--danger)', fontSize: '0.74rem', fontWeight: 600 }}>PENDIENTE</span>
                                        ) : (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{sol.num_cheque}</span>
                                                {sol.matched_local && (
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        padding: '0.1rem 0.35rem',
                                                        borderRadius: '4px',
                                                        background: 'rgba(59, 130, 246, 0.15)',
                                                        color: '#3b82f6',
                                                        fontWeight: 600
                                                    }} title="Cheque coincidente detectado en el libro de bancos">
                                                        Auto
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                        {isPending(sol) ? (
                                            <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => openModal(sol, 'asignar')}
                                                    title="Marcar como ya emitido asignando el número de cheque"
                                                    style={{
                                                        fontSize: '0.74rem',
                                                        padding: '0.25rem 0.55rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        background: 'rgba(16, 185, 129, 0.15)',
                                                        color: '#10b981',
                                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        borderRadius: '5px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    <Check size={13} /> Ya Emitido
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openModal(sol, 'generar')}
                                                    className="btn-primary"
                                                    title="Generar nuevo cheque en el libro de bancos"
                                                    style={{
                                                        fontSize: '0.74rem',
                                                        padding: '0.25rem 0.55rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        borderRadius: '5px'
                                                    }}
                                                >
                                                    <CreditCard size={13} /> Generar
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => openModal(sol, 'asignar')}
                                                    title="Modificar número de cheque"
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '4px',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer',
                                                        padding: '0.25rem 0.4rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDesvincular(sol)}
                                                    title="Desvincular cheque y devolver a estado pendiente"
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid rgba(239,68,68,0.25)',
                                                        borderRadius: '4px',
                                                        color: 'var(--danger)',
                                                        cursor: 'pointer',
                                                        padding: '0.25rem 0.4rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <Unlink size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Search size={36} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
                                    <p style={{ fontSize: '0.85rem' }}>No se encontraron solicitudes.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                open={showModal && !!selectedSolicitud}
                onClose={() => setShowModal(false)}
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <CreditCard size={18} color="var(--primary)" />
                        {modalMode === 'asignar' ? 'Asignar Cheque ya Emitido' : 'Generar Cheque en Bancos'}
                    </span>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.6rem' }}>
                        <button
                            type="button"
                            onClick={() => setModalMode('asignar')}
                            style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                border: 'none',
                                background: modalMode === 'asignar' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                color: modalMode === 'asignar' ? '#fff' : 'var(--text-muted)',
                                fontWeight: modalMode === 'asignar' ? 'bold' : 'normal'
                            }}
                        >
                            ✓ Ya fue emitido (Asignar No.)
                        </button>
                        <button
                            type="button"
                            onClick={() => setModalMode('generar')}
                            style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                border: 'none',
                                background: modalMode === 'generar' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                color: modalMode === 'generar' ? '#fff' : 'var(--text-muted)',
                                fontWeight: modalMode === 'generar' ? 'bold' : 'normal'
                            }}
                        >
                            + Generar nuevo en Bancos
                        </button>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Solicitud</label>
                            <input type="text" value={fmtFecha(selectedSolicitud?.fecha)} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%', height: '34px', fontSize: '0.825rem' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Monto a Pagar</label>
                            <input type="text" value={fmtMonto(selectedSolicitud?.monto)} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--primary)', fontWeight: 'bold', width: '100%', height: '34px', fontSize: '0.85rem' }} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Beneficiario / Proveedor</label>
                        <input type="text" value={selectedSolicitud?.nombre || selectedSolicitud?.cod_proveedor || ''} readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%', height: '34px', fontSize: '0.825rem' }} />
                    </div>

                    {modalMode === 'asignar' ? (
                        <>
                            <div style={{ padding: '0.55rem 0.75rem', borderRadius: '6px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Asigne el número del cheque ya emitido para saldar esta solicitud y quitarla de la lista de pendientes.
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>No. de Cheque *</label>
                                <input
                                    type="text"
                                    value={chequeNum}
                                    onChange={e => setChequeNum(e.target.value)}
                                    placeholder="Ej: 123456"
                                    autoFocus
                                    style={{ width: '100%', maxWidth: '240px', height: '36px', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem' }}>
                                <input
                                    type="checkbox"
                                    id="chkRegBancos"
                                    checked={registrarEnBancos}
                                    onChange={e => setRegistrarEnBancos(e.target.checked)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <label htmlFor="chkRegBancos" style={{ fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                                    Registrar también este movimiento en el Libro de Bancos de SIPE
                                </label>
                            </div>

                            {registrarEnBancos && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta Bancaria *</label>
                                    <select
                                        value={cuentaSelected}
                                        onChange={e => setCuentaSelected(e.target.value)}
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                    >
                                        <option value="">Seleccione cuenta...</option>
                                        {sortCuentas(cuentas).map(c => (
                                            <option key={c.corr} value={c.corr}>
                                                {formatCuentaLabel(c)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.825rem' }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleGuardarAsignar} className="btn-primary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <CheckCircle size={15} /> Asignar Cheque
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ padding: '0.55rem 0.75rem', borderRadius: '6px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Se registrará un nuevo cheque en el libro de bancos y se vinculará a la solicitud.
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta Bancaria *</label>
                                <select
                                    value={cuentaSelected}
                                    onChange={e => setCuentaSelected(e.target.value)}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                >
                                    <option value="">Seleccione cuenta...</option>
                                    {sortCuentas(cuentas).map(c => (
                                        <option key={c.corr} value={c.corr}>
                                            {formatCuentaLabel(c)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No. Cheque *</label>
                                <input
                                    type="text"
                                    value={chequeNum}
                                    onChange={e => setChequeNum(e.target.value)}
                                    placeholder="Número de cheque"
                                    style={{ width: '100%', maxWidth: '240px', height: '36px', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Concepto</label>
                                <input type="text" value="PAGO A PROVEEDOR (CONTADO)" readOnly style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text)', width: '100%', height: '34px', fontSize: '0.825rem' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.825rem' }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleGenerar} className="btn-primary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <CreditCard size={15} /> Generar en Bancos
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default ChequesContado;
