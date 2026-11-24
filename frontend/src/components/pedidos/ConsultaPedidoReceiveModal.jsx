import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Fuel,
    RefreshCw,
    CheckCircle2,
    ArrowLeftRight,
    PackageCheck,
    Landmark,
    Plus,
    Trash2,
    AlertTriangle
} from 'lucide-react';
import Modal from '../Modal';
import api from '../../services/api';
import { useToast } from '../Toast';
import { formatCuentaLabel, sortCuentas } from '../../utils/cuentaUtils';
import { todayStr } from '../../utils/date';
import { OrderStatusBadge } from './ConsultaPedidoDetailModal';

const formatNumber = (val, dec = 2) => {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const formatCurrency = (val, dec = 2) => {
    const num = parseFloat(val) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

const FUEL_FIELDS = [
    { key: 'D', label: 'Diésel', color: '#d97706', pKey: 'p_diesel', rKey: 'r_diesel', cKey: 'costo_d' },
    { key: 'R', label: 'Regular', color: '#059669', pKey: 'p_regular', rKey: 'r_regular', cKey: 'costo_r' },
    { key: 'S', label: 'Súper', color: '#dc2626', pKey: 'p_super', rKey: 'r_super', cKey: 'costo_s' },
    { key: 'I', label: 'Ion Diésel', color: '#7c3aed', pKey: 'p_ion', rKey: 'r_ion', cKey: 'costo_i' }
];

export default function ConsultaPedidoReceiveModal({
    open,
    order,
    initialMethod = 'CHEQUE',
    onClose,
    onSuccess
}) {
    const { addToast } = useToast();

    const [receiveMethod, setReceiveMethod] = useState(initialMethod);
    const [submitting, setSubmitting] = useState(false);

    const [receiveForm, setReceiveForm] = useState({
        fecha_descarga: '',
        documento: '',
        observacion: '',
        ncr_numero: '',
        ncr_monto: '0.00',
        cupones: '0.00',
        r_diesel: '0',
        r_regular: '0',
        r_super: '0',
        r_ion: '0',
        costo_d: '0',
        costo_r: '0',
        costo_s: '0',
        costo_i: '0',
        flete: '0'
    });

    const [banksData, setBanksData] = useState([]);
    const [bankAccountsData, setBankAccountsData] = useState([]);
    const [allBankAccountsData, setAllBankAccountsData] = useState([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [accountsError, setAccountsError] = useState('');

    // Cheques subform state
    const [selectedBank, setSelectedBank] = useState('');
    const [chequesList, setChequesList] = useState([]);
    const [chequeForm, setChequeForm] = useState({
        numero_cuenta: '',
        cheque: '',
        valor: '0.00',
        concepto: ''
    });
    const [isValidatingCheque, setIsValidatingCheque] = useState(false);

    // Transfer subform state
    const [transferBank, setTransferBank] = useState('');
    const [transferForm, setTransferForm] = useState({
        numero_cuenta: '',
        referencia: '',
        monto: '0.00',
        fecha_pago: '',
        concepto: ''
    });

    const loadedOrderDataRef = useRef({ orderId: null, transfer: false, vouchers: false });

    const loadBanksAndAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        setAccountsError('');
        try {
            const [bRes, aRes] = await Promise.all([
                api.get('/operaciones/consulta-pedidos/banks'),
                api.get('/operaciones/consulta-pedidos/bank-accounts')
            ]);
            setBanksData(bRes.data?.data || []);
            setAllBankAccountsData(aRes.data?.data || []);
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'No se pudieron cargar las cuentas bancarias de RRS';
            setAccountsError(msg);
            addToast(`Error cargando cuentas bancarias RRS: ${msg}`, 'error');
        } finally {
            setLoadingAccounts(false);
        }
    }, [addToast]);

    // Load banks & all active bank accounts when modal opens
    useEffect(() => {
        if (!open) return;
        loadBanksAndAccounts();
    }, [open, loadBanksAndAccounts]);

    // Load filtered accounts when selectedBank changes (Cheque mode)
    useEffect(() => {
        if (!open) return;
        if (!selectedBank) {
            setBankAccountsData([]);
            return;
        }
        let cancelled = false;
        api.get('/operaciones/consulta-pedidos/bank-accounts', { params: { bank_id: selectedBank } })
            .then((res) => {
                if (!cancelled) setBankAccountsData(res.data?.data || []);
            })
            .catch((err) => {
                if (!cancelled) {
                    setBankAccountsData([]);
                    addToast(err.response?.data?.error || 'Error al filtrar cuentas del banco', 'error');
                }
            });
        return () => { cancelled = true; };
    }, [open, selectedBank, addToast]);

    // Initialize form when modal opens or order / initialMethod changes
    useEffect(() => {
        if (!open || !order) return;

        setReceiveMethod(initialMethod);
        loadedOrderDataRef.current = { orderId: order.id, transfer: false, vouchers: false };

        const defaultToday = todayStr();
        let defaultDate = defaultToday;
        if (order.fecha_descarga && String(order.fecha_descarga).includes('/')) {
            const [d, m, y] = String(order.fecha_descarga).split('/');
            if (y && m && d) defaultDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        const pD = parseFloat(order.p_diesel) || 0;
        const pR = parseFloat(order.p_regular) || 0;
        const pS = parseFloat(order.p_super) || 0;
        const pI = parseFloat(order.p_ion) || 0;

        const rD = parseFloat(order.r_diesel) || 0;
        const rR = parseFloat(order.r_regular) || 0;
        const rS = parseFloat(order.r_super) || 0;
        const rI = parseFloat(order.r_ion) || 0;

        const docDefault = order.documento || '';
        const galD = rD > 0 ? rD : pD;
        const galR = rR > 0 ? rR : pR;
        const galS = rS > 0 ? rS : pS;
        const galI = rI > 0 ? rI : pI;

        const costD = order.costo_d !== undefined && order.costo_d !== null ? (parseFloat(order.costo_d) || 0) : 0;
        const costR = order.costo_r !== undefined && order.costo_r !== null ? (parseFloat(order.costo_r) || 0) : 0;
        const costS = order.costo_s !== undefined && order.costo_s !== null ? (parseFloat(order.costo_s) || 0) : 0;
        const costI = order.costo_i !== undefined && order.costo_i !== null ? (parseFloat(order.costo_i) || 0) : 0;
        const fleteVal = order.flete !== undefined && order.flete !== null ? (parseFloat(order.flete) || 0) : 0;

        const ncrMontoDefault = order.ncr_monto !== undefined && order.ncr_monto !== null ? String(order.ncr_monto) : '0.00';
        const cuponesDefault = order.cupones !== undefined && order.cupones !== null ? String(order.cupones) : '0.00';

        setReceiveForm({
            fecha_descarga: defaultDate,
            documento: docDefault,
            observacion: order.observacion || '',
            ncr_numero: order.ncr_numero || '',
            ncr_monto: ncrMontoDefault,
            cupones: cuponesDefault,
            r_diesel: String(galD),
            r_regular: String(galR),
            r_super: String(galS),
            r_ion: String(galI),
            costo_d: costD > 0 ? String(costD) : '0',
            costo_r: costR > 0 ? String(costR) : '0',
            costo_s: costS > 0 ? String(costS) : '0',
            costo_i: costI > 0 ? String(costI) : '0',
            flete: fleteVal > 0 ? String(fleteVal) : '0'
        });

        const totalEstimated =
            (galD * (costD + fleteVal)) +
            (galR * (costR + fleteVal)) +
            (galS * (costS + fleteVal)) +
            (galI * (costI + fleteVal));
        const netEstimated = Math.max(0, totalEstimated - (parseFloat(ncrMontoDefault) || 0) - (parseFloat(cuponesDefault) || 0));
        const initialPayment = order.pago && parseFloat(order.pago) > 0
            ? String(order.pago)
            : (netEstimated > 0 ? netEstimated.toFixed(2) : '0.00');

        setSelectedBank('');
        setChequesList([]);
        setChequeForm({
            numero_cuenta: '',
            cheque: '',
            valor: initialPayment,
            concepto: docDefault ? `PAGO DE PIPA CCF# ${docDefault}` : ''
        });
        setTransferBank('');
        setTransferForm({
            numero_cuenta: '',
            referencia: '',
            monto: initialPayment,
            fecha_pago: defaultDate,
            concepto: docDefault ? `PAGO DE PIPA CCF# ${docDefault}` : ''
        });
    }, [open, order, initialMethod]);

    // Fetch existing vouchers or transfer movement when receiveMethod is active
    useEffect(() => {
        if (!open || !order) return;
        let cancelled = false;

        if (receiveMethod === 'CHEQUE' && !loadedOrderDataRef.current.vouchers) {
            loadedOrderDataRef.current.vouchers = true;
            api.get(`/operaciones/consulta-pedidos/orders/${order.id}/vouchers`)
                .then((vRes) => {
                    if (cancelled) return;
                    const loaded = (vRes.data?.data || []).map((v) => ({
                        numero_cuenta: v.numero_cuenta,
                        nombre_cuenta: v.nombre_cuenta || v.numero_cuenta,
                        cheque: v.cheque,
                        valor: parseFloat(v.valor) || 0,
                        concepto: v.concepto || ''
                    }));
                    setChequesList(loaded);
                })
                .catch(() => {
                    if (!cancelled) setChequesList([]);
                });
        } else if (receiveMethod === 'TRANSFERENCIA' && !loadedOrderDataRef.current.transfer) {
            loadedOrderDataRef.current.transfer = true;
            api.get(`/operaciones/consulta-pedidos/orders/${order.id}/transfer`)
                .then((tRes) => {
                    if (cancelled) return;
                    const t = tRes.data?.data;
                    if (t) {
                        let fecPago = todayStr();
                        if (t.fecha && String(t.fecha).includes('/')) {
                            const [d, m, y] = String(t.fecha).split('/');
                            if (y && m && d) fecPago = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                        }
                        setTransferForm((prev) => ({
                            numero_cuenta: t.numero_cuenta || prev.numero_cuenta,
                            referencia: t.documento ? String(t.documento).trim() : prev.referencia,
                            monto: t.monto ? String(t.monto) : prev.monto,
                            fecha_pago: fecPago,
                            concepto: t.concepto || prev.concepto
                        }));
                    }
                })
                .catch(() => {});
        }

        return () => { cancelled = true; };
    }, [open, order, receiveMethod]);

    // Auto update transfer observation string
    useEffect(() => {
        if (receiveMethod === 'TRANSFERENCIA' && order) {
            const numCta = String(transferForm.numero_cuenta || '').trim();
            const ctaLast4 = numCta.length >= 4 ? numCta.slice(-4) : numCta;
            const montoNum = parseFloat(transferForm.monto) || 0;
            const baseForma = String(order.forma_pago || '').trim();

            if (numCta && montoNum > 0) {
                const montoFmt = montoNum.toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                setReceiveForm((prev) => ({
                    ...prev,
                    observacion: `${baseForma}**TRANSF. #${ctaLast4} - $${montoFmt}**`
                }));
            }
        }
    }, [receiveMethod, order, transferForm.numero_cuenta, transferForm.monto]);

    // Default concepts when document number changes
    useEffect(() => {
        if (receiveForm.documento) {
            const defaultConcept = `PAGO DE PIPA CCF# ${receiveForm.documento.trim()}`;
            setChequeForm((prev) => (prev.concepto ? prev : { ...prev, concepto: defaultConcept }));
            setTransferForm((prev) => (prev.concepto ? prev : { ...prev, concepto: defaultConcept }));
        }
    }, [receiveForm.documento]);

    const sortedTransferAccounts = useMemo(() => {
        const subset = transferBank
            ? allBankAccountsData.filter((a) => String(a.cod_banco) === String(transferBank))
            : allBankAccountsData;
        return sortCuentas(subset);
    }, [allBankAccountsData, transferBank]);

    const sortedFilteredAccounts = useMemo(() => sortCuentas(bankAccountsData), [bankAccountsData]);

    const fleteNum = parseFloat(receiveForm.flete) || 0;
    const totalGallons =
        (parseFloat(receiveForm.r_diesel) || 0) +
        (parseFloat(receiveForm.r_regular) || 0) +
        (parseFloat(receiveForm.r_super) || 0) +
        (parseFloat(receiveForm.r_ion) || 0);

    const totalEstimated =
        ((parseFloat(receiveForm.r_diesel) || 0) * ((parseFloat(receiveForm.costo_d) || 0) + fleteNum)) +
        ((parseFloat(receiveForm.r_regular) || 0) * ((parseFloat(receiveForm.costo_r) || 0) + fleteNum)) +
        ((parseFloat(receiveForm.r_super) || 0) * ((parseFloat(receiveForm.costo_s) || 0) + fleteNum)) +
        ((parseFloat(receiveForm.r_ion) || 0) * ((parseFloat(receiveForm.costo_i) || 0) + fleteNum));

    const cuponesVal = parseFloat(receiveForm.cupones) || 0;
    const ncrMontoVal = parseFloat(receiveForm.ncr_monto) || 0;
    const netToPay = Math.max(0, totalEstimated - ncrMontoVal - cuponesVal);
    const totalCheques = chequesList.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);
    const pagoTotalCheques = totalCheques + cuponesVal + ncrMontoVal;

    const handleApplyToPayment = () => {
        const formattedNeto = netToPay.toFixed(2);
        if (receiveMethod === 'TRANSFERENCIA') {
            setTransferForm((prev) => ({ ...prev, monto: formattedNeto }));
        } else {
            setChequeForm((prev) => ({ ...prev, valor: formattedNeto }));
        }
        addToast(`Monto de pago actualizado a $${formattedNeto}`, 'success');
    };

    const handleAddCheque = async () => {
        if (!selectedBank) {
            return addToast('Seleccione un banco', 'warning');
        }
        if (!chequeForm.numero_cuenta) {
            return addToast('Seleccione una cuenta bancaria', 'warning');
        }
        if (!chequeForm.cheque.trim()) {
            return addToast('Ingrese el número de cheque', 'warning');
        }
        const monto = parseFloat(chequeForm.valor) || 0;
        if (monto <= 0) {
            return addToast('Ingrese un monto válido para el cheque', 'warning');
        }
        if (!receiveForm.documento.trim()) {
            return addToast('Ingrese primero el número de documento', 'warning');
        }
        if (chequesList.some((c) => c.numero_cuenta === chequeForm.numero_cuenta && c.cheque === chequeForm.cheque.trim())) {
            return addToast('Este cheque ya fue agregado a la lista', 'warning');
        }

        try {
            setIsValidatingCheque(true);
            const res = await api.get('/operaciones/consulta-pedidos/vouchers/validate', {
                params: {
                    account: chequeForm.numero_cuenta,
                    cheque: chequeForm.cheque.trim()
                }
            });

            if (!res.data?.exists) {
                return addToast('Cheque no encontrado en RRS para esta cuenta', 'error');
            }

            const accountObj = bankAccountsData.find((a) => a.numero === chequeForm.numero_cuenta);
            const concepto = chequeForm.concepto.trim() || `PAGO DE PIPA CCF# ${receiveForm.documento.trim()}`;

            setChequesList((prev) => [
                ...prev,
                {
                    numero_cuenta: chequeForm.numero_cuenta,
                    nombre_cuenta: accountObj?.nombre || chequeForm.numero_cuenta,
                    cheque: chequeForm.cheque.trim(),
                    valor: monto,
                    concepto
                }
            ]);

            setChequeForm({
                numero_cuenta: '',
                cheque: '',
                valor: '0.00',
                concepto: `PAGO DE PIPA CCF# ${receiveForm.documento.trim()}`
            });
            setSelectedBank('');
            addToast('Cheque verificado y agregado', 'success');
        } catch (err) {
            addToast(err.response?.data?.error || 'Error al validar cheque', 'error');
        } finally {
            setIsValidatingCheque(false);
        }
    };

    const handleRemoveCheque = (index) => {
        setChequesList((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmitReceive = async (e) => {
        e.preventDefault();
        if (!order || submitting) return;

        if (!receiveForm.documento.trim()) {
            return addToast('Debe ingresar el número de documento', 'warning');
        }
        if (!receiveForm.fecha_descarga.trim()) {
            return addToast('Debe ingresar la fecha de descarga', 'warning');
        }

        const galD = parseFloat(receiveForm.r_diesel) || 0;
        const galR = parseFloat(receiveForm.r_regular) || 0;
        const galS = parseFloat(receiveForm.r_super) || 0;
        const galI = parseFloat(receiveForm.r_ion) || 0;

        const costD = parseFloat(receiveForm.costo_d) || 0;
        const costR = parseFloat(receiveForm.costo_r) || 0;
        const costS = parseFloat(receiveForm.costo_s) || 0;
        const costI = parseFloat(receiveForm.costo_i) || 0;

        if (galD <= 0 && galR <= 0 && galS <= 0 && galI <= 0) {
            return addToast('Debe ingresar los galones recibidos de al menos un producto', 'warning');
        }
        if (galD > 0 && costD <= 0) return addToast('Debe ingresar el costo por galón para Diésel', 'warning');
        if (galR > 0 && costR <= 0) return addToast('Debe ingresar el costo por galón para Regular', 'warning');
        if (galS > 0 && costS <= 0) return addToast('Debe ingresar el costo por galón para Súper', 'warning');
        if (galI > 0 && costI <= 0) return addToast('Debe ingresar el costo por galón para Ion Diésel', 'warning');

        if (receiveMethod === 'TRANSFERENCIA') {
            if (!transferForm.numero_cuenta) return addToast('Falta seleccionar la Cuenta Bancaria de RRS', 'warning');
            if (!transferForm.referencia.trim()) return addToast('Falta ingresar el Número de Referencia', 'warning');
            if ((parseFloat(transferForm.monto) || 0) <= 0) return addToast('Monto de transferencia incorrecto', 'warning');
        }

        const payload = {
            metodo_pago: receiveMethod,
            fecha_descarga: receiveForm.fecha_descarga,
            documento: receiveForm.documento.trim(),
            observacion: receiveForm.observacion.trim(),
            ncr_numero: receiveForm.ncr_numero.trim(),
            ncr_monto: ncrMontoVal,
            cupones: cuponesVal,
            r_diesel: galD,
            r_regular: galR,
            r_super: galS,
            r_ion: galI,
            costo_d: costD,
            costo_r: costR,
            costo_s: costS,
            costo_i: costI,
            flete: fleteNum,
            cheques: chequesList.map((c) => ({
                numero_cuenta: c.numero_cuenta,
                cheque: c.cheque,
                valor: c.valor,
                concepto: c.concepto
            })),
            numero_cuenta: transferForm.numero_cuenta,
            referencia: transferForm.referencia.trim(),
            monto: parseFloat(transferForm.monto) || 0,
            fecha_pago: transferForm.fecha_pago || receiveForm.fecha_descarga,
            concepto: transferForm.concepto.trim() || `PAGO DE PIPA CCF# ${receiveForm.documento.trim()}`
        };

        try {
            setSubmitting(true);
            const res = await api.patch(`/operaciones/consulta-pedidos/orders/${order.id}/receive`, payload);
            addToast(res.data?.message || 'Pedido recibido exitosamente', 'success');
            if (onSuccess) onSuccess(res.data);
            onClose();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error al registrar recepción del pedido', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open || !order) return null;

    const inputStyle = {
        height: '32px',
        fontSize: '0.8rem',
        padding: '0.25rem 0.55rem',
        width: '100%'
    };

    const selectStyle = {
        ...inputStyle,
        padding: '0.25rem 2rem 0.25rem 0.55rem'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.68rem',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '0.15rem',
        letterSpacing: '0.03em'
    };

    const accountsErrorBanner = accountsError ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.55rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--danger)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={15} />
                <span>Error cargando cuentas bancarias de RRS: {accountsError}</span>
            </span>
            <button
                type="button"
                onClick={loadBanksAndAccounts}
                className="btn-secondary"
                style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
                <RefreshCw size={12} />
                <span>Reintentar</span>
            </button>
        </div>
    ) : null;

    const transferSection = (
        <div style={{ padding: '0.55rem 0.75rem', background: 'rgba(16, 185, 129, 0.06)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.28)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ArrowLeftRight size={14} />
                    <span>Datos de Transferencia Bancaria (RRS)</span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {loadingAccounts ? 'Cargando cuentas...' : `(${sortedTransferAccounts.length} cuentas)`}
                </span>
            </div>

            {accountsErrorBanner}

            <div className="form-grid form-grid-3" style={{ gap: '0.5rem' }}>
                <div>
                    <label style={labelStyle}>Banco (Opcional)</label>
                    <select
                        value={transferBank}
                        onChange={(e) => setTransferBank(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="">-- Todos ({banksData.length}) --</option>
                        {banksData.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.descripcion}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="span-2">
                    <label style={labelStyle}>
                        Cuenta Bancaria (RRS) <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <select
                        required
                        value={transferForm.numero_cuenta}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, numero_cuenta: e.target.value }))}
                        style={selectStyle}
                    >
                        <option value="">
                            {loadingAccounts ? '-- Cargando cuentas RRS... --' : '-- Seleccione Cuenta Bancaria --'}
                        </option>
                        {sortedTransferAccounts.map((a) => (
                            <option key={`${a.id_empresa || ''}-${a.numero}`} value={a.numero}>
                                {formatCuentaLabel(a)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: '2 1 200px' }}>
                    <label style={labelStyle}>Concepto</label>
                    <input
                        type="text"
                        placeholder="PAGO DE PIPA CCF# ..."
                        value={transferForm.concepto}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, concepto: e.target.value }))}
                        style={inputStyle}
                    />
                </div>

                <div style={{ flex: '0 1 130px' }}>
                    <label style={labelStyle}>
                        Referencia <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                        type="text"
                        required
                        maxLength={10}
                        placeholder="Máx. 10 car."
                        value={transferForm.referencia}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, referencia: e.target.value }))}
                        style={{ ...inputStyle, fontWeight: 'bold' }}
                    />
                </div>

                <div style={{ flex: '0 1 125px' }}>
                    <label style={labelStyle}>
                        Monto ($) <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={transferForm.monto}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, monto: e.target.value }))}
                        style={{ ...inputStyle, textAlign: 'right', fontWeight: 'bold' }}
                    />
                </div>

                <div style={{ flex: '0 1 138px' }}>
                    <label style={labelStyle}>
                        Fecha Pago <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                        type="date"
                        required
                        value={transferForm.fecha_pago}
                        onChange={(e) => setTransferForm((prev) => ({ ...prev, fecha_pago: e.target.value }))}
                        style={inputStyle}
                    />
                </div>
            </div>
        </div>
    );

    const chequesSection = (
        <>
            <div style={{ padding: '0.85rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Landmark size={15} color="var(--primary)" />
                        <span>Emisión y Registro de Cheques</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {chequesList.length} cheque(s) en lista
                    </span>
                </div>

                {accountsErrorBanner}

                <div className="form-grid form-grid-2">
                    <div>
                        <label style={labelStyle}>Banco</label>
                        <select
                            value={selectedBank}
                            onChange={(e) => {
                                setSelectedBank(e.target.value);
                                setChequeForm((prev) => ({ ...prev, numero_cuenta: '' }));
                            }}
                            style={selectStyle}
                        >
                            <option value="">-- Seleccionar Banco --</option>
                            {banksData.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.descripcion}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle}>Cuenta Bancaria</label>
                        <select
                            value={chequeForm.numero_cuenta}
                            disabled={!selectedBank}
                            onChange={(e) => setChequeForm((prev) => ({ ...prev, numero_cuenta: e.target.value }))}
                            style={selectStyle}
                        >
                            <option value="">-- Seleccione Cuenta --</option>
                            {sortedFilteredAccounts.map((a) => (
                                <option key={`${a.id_empresa || ''}-${a.numero}`} value={a.numero}>
                                    {formatCuentaLabel(a)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-grid form-grid-3">
                    <div>
                        <label style={labelStyle}>Concepto</label>
                        <input
                            type="text"
                            placeholder="PAGO DE PIPA..."
                            value={chequeForm.concepto}
                            onChange={(e) => setChequeForm((prev) => ({ ...prev, concepto: e.target.value }))}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}># Cheque</label>
                        <input
                            type="text"
                            placeholder="Ej. 4165536"
                            value={chequeForm.cheque}
                            onChange={(e) => setChequeForm((prev) => ({ ...prev, cheque: e.target.value }))}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Monto ($)</label>
                        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={chequeForm.valor}
                                onChange={(e) => setChequeForm((prev) => ({ ...prev, valor: e.target.value }))}
                                style={{ ...inputStyle, textAlign: 'right', fontWeight: 'bold' }}
                            />
                            <button
                                type="button"
                                onClick={handleAddCheque}
                                disabled={isValidatingCheque || !chequeForm.numero_cuenta || !chequeForm.cheque.trim()}
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#059669', flexShrink: 0 }}
                            >
                                {isValidatingCheque ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
                                <span>Agregar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="table-responsive" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '580px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Número Cta.</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Concepto</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cheque</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Monto</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', width: '70px' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chequesList.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                        No se han registrado cheques para este pago
                                    </td>
                                </tr>
                            ) : (
                                chequesList.map((chq, idx) => (
                                    <tr key={`${chq.numero_cuenta}-${chq.cheque}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                            <div style={{ fontWeight: '600' }}>{chq.numero_cuenta}</div>
                                            {chq.nombre_cuenta && chq.nombre_cuenta !== chq.numero_cuenta && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{chq.nombre_cuenta}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {chq.concepto}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                            #{chq.cheque}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            {formatCurrency(chq.valor, 2)}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCheque(idx)}
                                                className="icon-btn"
                                                style={{ color: 'var(--danger)' }}
                                                title="Eliminar cheque"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {chequesList.length > 0 && (
                            <tfoot>
                                <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', fontWeight: 'bold' }}>
                                    <td colSpan={3} style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                                        Subtotal Cheques
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.82rem', color: 'var(--primary)' }}>
                                        {formatCurrency(totalCheques, 2)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Descuento Cupones y Pago Total */}
            <div style={{ padding: '0.75rem 0.9rem', background: '#0f172a', color: '#f8fafc', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                    <label style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                        Descuento Cupones ($):
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={receiveForm.cupones}
                        onChange={(e) => setReceiveForm((prev) => ({ ...prev, cupones: e.target.value }))}
                        style={{ width: '125px', height: '34px', textAlign: 'right', fontWeight: 'bold', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '0.25rem 0.5rem' }}
                    />
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Pago Total:
                    </span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#34d399' }}>
                        {formatCurrency(pagoTotalCheques, 2)}
                    </span>
                </div>
            </div>
        </>
    );

    return (
        <Modal
            open={open && !!order}
            onClose={onClose}
            size="xl"
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', width: '100%', paddingRight: '0.5rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {receiveMethod === 'TRANSFERENCIA' ? <ArrowLeftRight size={18} color="#059669" /> : <PackageCheck size={18} color="var(--primary)" />}
                        <span>Recibir Pedido #{order.numero || order.id}</span>
                        <OrderStatusBadge estado={order.estado} />
                    </span>
                    <div style={{ display: 'inline-flex', gap: '0.25rem', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button
                            type="button"
                            onClick={() => setReceiveMethod('CHEQUE')}
                            style={{
                                padding: '0.25rem 0.65rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                background: receiveMethod === 'CHEQUE' ? 'var(--primary)' : 'transparent',
                                color: receiveMethod === 'CHEQUE' ? '#fff' : 'var(--text-muted)'
                            }}
                        >
                            Cheque
                        </button>
                        <button
                            type="button"
                            onClick={() => setReceiveMethod('TRANSFERENCIA')}
                            style={{
                                padding: '0.25rem 0.65rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                background: receiveMethod === 'TRANSFERENCIA' ? '#059669' : 'transparent',
                                color: receiveMethod === 'TRANSFERENCIA' ? '#fff' : 'var(--text-muted)'
                            }}
                        >
                            Transferencia
                        </button>
                    </div>
                </div>
            }
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
                    <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">
                        Salir / Cancelar
                    </button>
                    <button
                        type="submit"
                        form="consulta-pedido-receive-form"
                        disabled={submitting}
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#059669' }}
                    >
                        {submitting ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        <span>Guardar Descarga</span>
                    </button>
                </div>
            }
        >
            <form id="consulta-pedido-receive-form" onSubmit={handleSubmitReceive} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Sección 1: Datos generales */}
                <div style={{ padding: '0.55rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div className="form-grid form-grid-3" style={{ gap: '0.5rem' }}>
                        <div>
                            <span style={labelStyle}>Forma de Pago Original</span>
                            <div
                                style={{
                                    height: '32px',
                                    padding: '0 0.55rem',
                                    background: 'var(--card-bg)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                title={order.forma_pago || 'CREDITO'}
                            >
                                {order.forma_pago || 'CREDITO'}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Número Doc. / CCF <span style={{ color: 'var(--danger)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ej. 53930"
                                value={receiveForm.documento}
                                onChange={(e) => setReceiveForm((prev) => ({ ...prev, documento: e.target.value }))}
                                style={inputStyle}
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>
                                Fecha Descarga <span style={{ color: 'var(--danger)' }}>*</span>
                            </label>
                            <input
                                type="date"
                                required
                                value={receiveForm.fecha_descarga}
                                onChange={(e) => setReceiveForm((prev) => ({ ...prev, fecha_descarga: e.target.value }))}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={labelStyle}>Observación</label>
                        <input
                            type="text"
                            maxLength={200}
                            placeholder="Observaciones de la descarga..."
                            value={receiveForm.observacion}
                            onChange={(e) => setReceiveForm((prev) => ({ ...prev, observacion: e.target.value }))}
                            style={inputStyle}
                        />
                    </div>
                </div>

                {/* En modo Transferencia mostrar primero los datos bancarios para selección inmediata */}
                {receiveMethod === 'TRANSFERENCIA' && transferSection}

                {/* Sección 2: Descarga de Combustibles y Captura de Costos */}
                <div style={{ padding: '0.55rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Fuel size={15} color="var(--primary)" />
                            <span>Descarga de Combustible y Captura de Costos</span>
                        </span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Flete /gln ($):
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={receiveForm.flete}
                                onChange={(e) => setReceiveForm((prev) => ({ ...prev, flete: e.target.value }))}
                                style={{ width: '115px', height: '34px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 'bold', padding: '0.25rem 0.5rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                        {FUEL_FIELDS.map((f) => {
                            const galRec = parseFloat(receiveForm[f.rKey]) || 0;
                            const unitCost = parseFloat(receiveForm[f.cKey]) || 0;
                            const missingCost = galRec > 0 && unitCost <= 0;
                            const subtotal = galRec * (unitCost + fleteNum);

                            return (
                                <div
                                    key={f.key}
                                    style={{
                                        flex: '1 1 190px',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '0.65rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '0.45rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.8rem', color: f.color, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.color }} />
                                            {f.label}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                                            Ped: {formatNumber(order[f.pKey], 0)} gln
                                        </span>
                                    </div>

                                    <div>
                                        <label style={{ ...labelStyle, fontSize: '0.68rem' }}>Galones Recibidos</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={receiveForm[f.rKey]}
                                            onChange={(e) => setReceiveForm((prev) => ({ ...prev, [f.rKey]: e.target.value }))}
                                            style={{ ...inputStyle, height: '32px', textAlign: 'right', fontWeight: 'bold' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ ...labelStyle, fontSize: '0.68rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Costo /gln ($)</span>
                                            {missingCost && <span style={{ color: 'var(--danger)', textTransform: 'lowercase' }}>requerido</span>}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.00001"
                                            min="0"
                                            value={receiveForm[f.cKey]}
                                            onChange={(e) => setReceiveForm((prev) => ({ ...prev, [f.cKey]: e.target.value }))}
                                            style={{
                                                ...inputStyle,
                                                height: '32px',
                                                textAlign: 'right',
                                                fontWeight: 'bold',
                                                borderColor: missingCost ? 'var(--danger)' : undefined
                                            }}
                                        />
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.35rem', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        {fleteNum > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                                <span>Costo + Flete:</span>
                                                <span>{formatCurrency(unitCost + fleteNum, 4)}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Subtotal:</span>
                                            <span style={{ color: f.color }}>{formatCurrency(subtotal, 2)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Live summary bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.22)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Galones</div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.86rem' }}>{formatNumber(totalGallons, 2)} gln</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Estimado</div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.86rem', color: 'var(--primary)' }}>{formatCurrency(totalEstimated, 2)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Neto a Pagar</div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#059669' }}>{formatCurrency(netToPay, 2)}</div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleApplyToPayment}
                            className="btn-secondary"
                            style={{ height: '34px', fontSize: '0.78rem', padding: '0 0.85rem', fontWeight: '600', color: 'var(--primary)' }}
                        >
                            Aplicar al Monto de Pago
                        </button>
                    </div>

                    {/* Notas de Crédito */}
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={labelStyle}>Notas Crédito (Números)</label>
                            <input
                                type="text"
                                placeholder="0001, 0002, 0003"
                                value={receiveForm.ncr_numero}
                                onChange={(e) => setReceiveForm((prev) => ({ ...prev, ncr_numero: e.target.value }))}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Monto Notas Crédito ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={receiveForm.ncr_monto}
                                onChange={(e) => setReceiveForm((prev) => ({ ...prev, ncr_monto: e.target.value }))}
                                style={{ ...inputStyle, textAlign: 'right', fontWeight: '600' }}
                            />
                        </div>
                    </div>
                </div>

                {/* En modo Cheque mostrar emisión y registro de cheques */}
                {receiveMethod === 'CHEQUE' && chequesSection}
            </form>
        </Modal>
    );
}
