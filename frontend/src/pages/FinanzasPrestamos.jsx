import React, { useState, useEffect, useMemo } from 'react';
import { Landmark, Plus, Search, Edit2, Trash2, Eye, DollarSign, Calendar, TrendingDown, CheckCircle2, Clock, FileSpreadsheet, FileText, ArrowUpRight, Percent, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import api from '../services/api';
import { calculatePMT, formatCurrency, generateAmortizationSchedule, calculateRemainingPayoffFromBalance, FREQUENCIES } from '../utils/loanCalculations';

export default function FinanzasPrestamos() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [prestamos, setPrestamos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterEmpresa, setFilterEmpresa] = useState('');
    const [filterEstado, setFilterEstado] = useState('activo');
    const [searchTerm, setSearchTerm] = useState('');

    // Modals
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingLoan, setEditingLoan] = useState(null);
    const [formData, setFormData] = useState({
        empresa_id: '',
        banco_id: '',
        cuenta_bancaria_id: '',
        numero_prestamo: '',
        descripcion: '',
        monto_original: '',
        tasa_interes_anual: '',
        plazo_meses: 60,
        frecuencia_pago: 'mensual',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_primer_pago: new Date().toISOString().split('T')[0],
        cuota_calculada: '',
        dias_gracia: 0,
        notas: ''
    });

    // Detail Modal State
    const [selectedLoan, setSelectedLoan] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailTab, setDetailTab] = useState('pagos'); // 'pagos' | 'amortizacion' | 'simulador'
    const [extraSimulatorMonthly, setExtraSimulatorMonthly] = useState(0);

    // Payment Registration Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        fecha_pago: new Date().toISOString().split('T')[0],
        tipo_pago: 'cuota_regular',
        monto_total: '',
        monto_capital: '',
        monto_interes: '',
        monto_otros: 0,
        numero_comprobante: '',
        cuenta_origen_id: '',
        notas: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [pRes, cRes] = await Promise.all([
                api.get('/finanzas/prestamos'),
                api.get('/finanzas/catalogos')
            ]);
            setPrestamos(pRes.data || []);
            setEmpresas(cRes.data.empresas || []);
            setBancos(cRes.data.bancos || []);
            setCuentas(cRes.data.cuentas || []);
        } catch (error) {
            addToast('Error al cargar préstamos y catálogos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filtered loans
    const filteredPrestamos = useMemo(() => {
        return prestamos.filter(p => {
            const matchEmpresa = !filterEmpresa || String(p.empresa_id) === String(filterEmpresa);
            const matchEstado = filterEstado === 'todos' || p.estado === filterEstado;
            const term = searchTerm.toLowerCase();
            const matchSearch = !searchTerm ||
                (p.numero_prestamo || '').toLowerCase().includes(term) ||
                (p.descripcion || '').toLowerCase().includes(term) ||
                (p.banco_nombre || '').toLowerCase().includes(term) ||
                (p.empresa_nombre || '').toLowerCase().includes(term);

            return matchEmpresa && matchEstado && matchSearch;
        });
    }, [prestamos, filterEmpresa, filterEstado, searchTerm]);

    // KPI Summary
    const kpis = useMemo(() => {
        const activos = prestamos.filter(p => p.estado === 'activo');
        const totalContratado = activos.reduce((acc, p) => acc + (p.monto_original || 0), 0);
        const totalAmortizado = activos.reduce((acc, p) => acc + (p.total_capital_pagado || 0), 0);
        const saldoTotal = activos.reduce((acc, p) => acc + (p.saldo_actual || 0), 0);
        const cuotaMensual = activos.reduce((acc, p) => acc + (p.cuota_calculada || 0), 0);

        return { totalContratado, totalAmortizado, saldoTotal, cuotaMensual, activosCount: activos.length };
    }, [prestamos]);

    // Handle Cuota auto-calculation in form
    const autoCuota = useMemo(() => {
        if (!formData.monto_original || !formData.tasa_interes_anual || !formData.plazo_meses) return 0;
        return calculatePMT(formData.monto_original, formData.tasa_interes_anual, formData.plazo_meses, formData.frecuencia_pago);
    }, [formData.monto_original, formData.tasa_interes_anual, formData.plazo_meses, formData.frecuencia_pago]);

    const handleOpenCreate = () => {
        setEditingLoan(null);
        setFormData({
            empresa_id: empresas[0]?.id || '',
            banco_id: bancos[0]?.id || '',
            cuenta_bancaria_id: '',
            numero_prestamo: '',
            descripcion: '',
            monto_original: '',
            tasa_interes_anual: 9.5,
            plazo_meses: 60,
            frecuencia_pago: 'mensual',
            fecha_inicio: new Date().toISOString().split('T')[0],
            fecha_primer_pago: new Date().toISOString().split('T')[0],
            cuota_calculada: '',
            dias_gracia: 0,
            notas: ''
        });
        setShowFormModal(true);
    };

    const handleOpenEdit = (p) => {
        setEditingLoan(p);
        setFormData({
            empresa_id: p.empresa_id || '',
            banco_id: p.banco_id || '',
            cuenta_bancaria_id: p.cuenta_bancaria_id || '',
            numero_prestamo: p.numero_prestamo || '',
            descripcion: p.descripcion || '',
            monto_original: p.monto_original || '',
            tasa_interes_anual: p.tasa_interes_anual || '',
            plazo_meses: p.plazo_meses || 60,
            frecuencia_pago: p.frecuencia_pago || 'mensual',
            fecha_inicio: (p.fecha_inicio || '').split('T')[0],
            fecha_primer_pago: (p.fecha_primer_pago || '').split('T')[0],
            cuota_calculada: p.cuota_calculada || '',
            dias_gracia: p.dias_gracia || 0,
            notas: p.notas || ''
        });
        setShowFormModal(true);
    };

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        const cuota = parseFloat(formData.cuota_calculada) || autoCuota;
        try {
            if (editingLoan) {
                await api.put(`/finanzas/prestamos/${editingLoan.id}`, {
                    ...formData,
                    cuota_calculada: cuota
                });
                addToast('Préstamo actualizado exitosamente', 'success');
            } else {
                await api.post('/finanzas/prestamos', {
                    ...formData,
                    cuota_calculada: cuota
                });
                addToast('Préstamo registrado exitosamente', 'success');
            }
            setShowFormModal(false);
            fetchData();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al guardar préstamo', 'error');
        }
    };

    const handleDeleteLoan = async (id, numero) => {
        if (!await confirm(`¿Estás seguro de eliminar o cancelar el préstamo ${numero}?`, { variant: 'danger' })) return;
        try {
            await api.delete(`/finanzas/prestamos/${id}`);
            addToast('Préstamo procesado', 'success');
            fetchData();
            if (selectedLoan?.id === id) setShowDetailModal(false);
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al eliminar', 'error');
        }
    };

    // Load detail and payments
    const handleViewDetail = async (loan) => {
        try {
            const { data } = await api.get(`/finanzas/prestamos/${loan.id}`);
            setSelectedLoan(data);
            setDetailTab('pagos');
            setExtraSimulatorMonthly(0);
            setShowDetailModal(true);
        } catch (error) {
            addToast('Error al cargar detalle del préstamo', 'error');
        }
    };

    // Open Register Payment Modal
    const handleOpenPayment = () => {
        if (!selectedLoan) return;
        const regularCuota = selectedLoan.cuota_calculada || 0;
        // Estimated interest on current balance for 1 period
        const periodsPerYear = FREQUENCIES[selectedLoan.frecuencia_pago]?.periodsPerYear || 12;
        const periodRate = (selectedLoan.tasa_interes_anual / 100) / periodsPerYear;
        const estInterest = Math.round(selectedLoan.saldo_actual * periodRate * 100) / 100;
        const estCapital = Math.max(0, Math.round((regularCuota - estInterest) * 100) / 100);

        setPaymentForm({
            fecha_pago: new Date().toISOString().split('T')[0],
            tipo_pago: 'cuota_regular',
            monto_total: regularCuota,
            monto_capital: estCapital,
            monto_interes: estInterest,
            monto_otros: 0,
            numero_comprobante: '',
            cuenta_origen_id: selectedLoan.cuenta_bancaria_id || '',
            notas: ''
        });
        setShowPaymentModal(true);
    };

    const handleSavePayment = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post(`/finanzas/prestamos/${selectedLoan.id}/pagos`, paymentForm);
            addToast(res.data.message || 'Pago registrado exitosamente', 'success');
            setShowPaymentModal(false);
            // Refresh detail
            const { data } = await api.get(`/finanzas/prestamos/${selectedLoan.id}`);
            setSelectedLoan(data);
            fetchData();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al registrar pago', 'error');
        }
    };

    const handleDeletePayment = async (pagoId) => {
        if (!await confirm('¿Estás seguro de anular y revertir este pago?', { variant: 'danger' })) return;
        try {
            await api.delete(`/finanzas/pagos/${pagoId}`);
            addToast('Pago revertido', 'success');
            const { data } = await api.get(`/finanzas/prestamos/${selectedLoan.id}`);
            setSelectedLoan(data);
            fetchData();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al revertir pago', 'error');
        }
    };

    // Generate Planned Amortization for Selected Loan
    const plannedAmortization = useMemo(() => {
        if (!selectedLoan) return null;
        return generateAmortizationSchedule({
            principal: selectedLoan.monto_original,
            annualRate: selectedLoan.tasa_interes_anual,
            termMonths: selectedLoan.plazo_meses,
            frequency: selectedLoan.frecuencia_pago,
            startDate: (selectedLoan.fecha_primer_pago || '').split('T')[0]
        });
    }, [selectedLoan]);

    // Simulator calculation on active balance
    const activePayoffSimulation = useMemo(() => {
        if (!selectedLoan || selectedLoan.saldo_actual <= 0) return null;
        return calculateRemainingPayoffFromBalance(
            selectedLoan.saldo_actual,
            selectedLoan.cuota_calculada,
            selectedLoan.tasa_interes_anual,
            selectedLoan.frecuencia_pago,
            extraSimulatorMonthly
        );
    }, [selectedLoan, extraSimulatorMonthly]);

    const basePayoffSimulation = useMemo(() => {
        if (!selectedLoan || selectedLoan.saldo_actual <= 0) return null;
        return calculateRemainingPayoffFromBalance(
            selectedLoan.saldo_actual,
            selectedLoan.cuota_calculada,
            selectedLoan.tasa_interes_anual,
            selectedLoan.frecuencia_pago,
            0
        );
    }, [selectedLoan]);

    // Export loans table to Excel
    const exportLoansExcel = () => {
        if (filteredPrestamos.length === 0) return;
        const data = filteredPrestamos.map(p => ({
            'Empresa': p.empresa_nombre,
            'Banco': p.banco_nombre || 'N/A',
            'N° Préstamo': p.numero_prestamo,
            'Descripción': p.descripcion,
            'Monto Original': p.monto_original,
            'Tasa Anual': `${p.tasa_interes_anual}%`,
            'Plazo (Meses)': p.plazo_meses,
            'Cuota': p.cuota_calculada,
            'Total Pagado': p.total_capital_pagado,
            'Saldo Actual': p.saldo_actual,
            '% Amortizado': `${p.porcentaje_amortizado}%`,
            'Estado': p.estado
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Prestamos");
        XLSX.writeFile(wb, `Prestamos_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Export loans table to PDF
    const exportLoansPDF = () => {
        if (filteredPrestamos.length === 0) return;
        const doc = new jsPDF('landscape');
        doc.setFontSize(15);
        doc.text('Control de Préstamos y Deuda Financiera', 14, 15);
        doc.setFontSize(9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} | Saldo Deudor Total: ${formatCurrency(kpis.saldoTotal)}`, 14, 22);

        const columns = ['Empresa', 'Banco', 'N° Préstamo', 'Monto Original', 'Tasa', 'Cuota', 'Amortizado', 'Saldo Actual', 'Estado'];
        const rows = filteredPrestamos.map(p => [
            p.empresa_nombre,
            p.banco_nombre || 'N/A',
            p.numero_prestamo,
            formatCurrency(p.monto_original),
            `${p.tasa_interes_anual}%`,
            formatCurrency(p.cuota_calculada),
            formatCurrency(p.total_capital_pagado),
            formatCurrency(p.saldo_actual),
            p.estado.toUpperCase()
        ]);

        autoTable(doc, {
            head: [columns],
            body: rows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }
        });

        doc.save(`Prestamos_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    return (
        <div>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Landmark size={28} color="var(--primary)" /> Préstamos y Créditos Bancarios
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Control de créditos contratados, cronogramas de amortización, registro de cuotas y abonos extraordinarios a capital.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={handleOpenCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={18} /> Nuevo Préstamo
                    </button>
                    <button onClick={exportLoansExcel} disabled={filteredPrestamos.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button onClick={exportLoansPDF} disabled={filteredPrestamos.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Monto Total Contratado</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatCurrency(kpis.totalContratado)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{kpis.activosCount} préstamos activos</div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Capital Amortizado</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent, #10b981)' }}>{formatCurrency(kpis.totalAmortizado)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {kpis.totalContratado > 0 ? `${((kpis.totalAmortizado / kpis.totalContratado) * 100).toFixed(1)}% liquidado` : '0%'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ fontSize: '0.8rem', color: '#f87171', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Saldo Total Pendiente</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>{formatCurrency(kpis.saldoTotal)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Deuda capital actual</div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Servicio de Deuda Mensual</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{formatCurrency(kpis.cuotaMensual)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Compromiso mensual en cuotas</div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card glass" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '200px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por N° préstamo, banco, descripción..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', height: '42px', paddingLeft: '38px' }}
                    />
                </div>

                <div style={{ flex: 1, minWidth: '160px' }}>
                    <select
                        value={filterEmpresa}
                        onChange={e => setFilterEmpresa(e.target.value)}
                        style={{ width: '100%', height: '42px' }}
                    >
                        <option value="">Todas las Empresas</option>
                        {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                    </select>
                </div>

                <div style={{ flex: 1, minWidth: '140px' }}>
                    <select
                        value={filterEstado}
                        onChange={e => setFilterEstado(e.target.value)}
                        style={{ width: '100%', height: '42px' }}
                    >
                        <option value="activo">Activos</option>
                        <option value="pagado">Pagados / Liquidados</option>
                        <option value="cancelado">Cancelados</option>
                        <option value="todos">Todos los Estados</option>
                    </select>
                </div>

                <button onClick={fetchData} className="btn-secondary" style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RefreshCw size={16} /> Refrescar
                </button>
            </div>

            {/* Loans Table */}
            <div className="card glass table-responsive" style={{ padding: '1.5rem' }}>
                <table style={{ minWidth: '1050px', width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.65rem' }}>Empresa</th>
                            <th style={{ padding: '0.65rem' }}>Banco Acreedor</th>
                            <th style={{ padding: '0.65rem' }}>N° Préstamo</th>
                            <th style={{ padding: '0.65rem' }}>Descripción</th>
                            <th style={{ padding: '0.65rem' }}>Monto Original</th>
                            <th style={{ padding: '0.65rem' }}>Tasa %</th>
                            <th style={{ padding: '0.65rem' }}>Cuota Periódica</th>
                            <th style={{ padding: '0.65rem' }}>Saldo Pendiente</th>
                            <th style={{ padding: '0.65rem', minWidth: '120px' }}>Amortizado</th>
                            <th style={{ padding: '0.65rem' }}>Estado</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPrestamos.length === 0 ? (
                            <tr>
                                <td colSpan="11" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {loading ? 'Cargando préstamos...' : 'No se encontraron préstamos con los filtros seleccionados.'}
                                </td>
                            </tr>
                        ) : (
                            filteredPrestamos.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{p.empresa_nombre}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.banco_nombre || 'N/A'}</td>
                                    <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>{p.numero_prestamo}</td>
                                    <td style={{ padding: '0.6rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descripcion}>
                                        {p.descripcion}
                                    </td>
                                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{formatCurrency(p.monto_original)}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.tasa_interes_anual}%</td>
                                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{formatCurrency(p.cuota_calculada)}</td>
                                    <td style={{ padding: '0.6rem', fontWeight: 700, color: p.saldo_actual > 0 ? '#f87171' : 'var(--accent, #10b981)' }}>
                                        {formatCurrency(p.saldo_actual)}
                                    </td>
                                    <td style={{ padding: '0.6rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${p.porcentaje_amortizado}%`, height: '100%', background: p.porcentaje_amortizado >= 100 ? '#10b981' : 'var(--primary)' }}></div>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{p.porcentaje_amortizado}%</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.6rem' }}>
                                        <span style={{
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: p.estado === 'activo' ? 'rgba(16, 185, 129, 0.15)' : p.estado === 'pagado' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                            color: p.estado === 'activo' ? '#10b981' : p.estado === 'pagado' ? '#3b82f6' : '#ef4444'
                                        }}>
                                            {p.estado.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                            <button onClick={() => handleViewDetail(p)} className="icon-btn" title="Ver Detalle, Pagos y Amortización" style={{ color: 'var(--primary)' }}>
                                                <Eye size={18} />
                                            </button>
                                            <button onClick={() => handleOpenEdit(p)} className="icon-btn" title="Editar Préstamo">
                                                <Edit2 size={18} />
                                            </button>
                                            <button onClick={() => handleDeleteLoan(p.id, p.numero_prestamo)} className="icon-btn" title="Eliminar / Cancelar" style={{ color: 'var(--danger, #ef4444)' }}>
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create / Edit Loan Modal */}
            <Modal
                open={showFormModal}
                onClose={() => setShowFormModal(false)}
                title={editingLoan ? 'Editar Préstamo Bancario' : 'Nuevo Préstamo Bancario'}
                size="lg"
            >
                <form onSubmit={handleSaveLoan} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa Titular *</label>
                            <select
                                required
                                value={formData.empresa_id}
                                onChange={e => setFormData({ ...formData, empresa_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">Seleccione empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre} ({emp.codigo})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Banco Acreedor</label>
                            <select
                                value={formData.banco_id}
                                onChange={e => setFormData({ ...formData, banco_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">(Opcional) Seleccione banco...</option>
                                {bancos.map(b => (
                                    <option key={b.id} value={b.id}>{b.descripcion}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cuenta Bancaria Asignada para Pagos</label>
                            <select
                                value={formData.cuenta_bancaria_id}
                                onChange={e => setFormData({ ...formData, cuenta_bancaria_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">(Opcional) Seleccione cuenta...</option>
                                {cuentas.map(c => (
                                    <option key={c.id} value={c.id}>{c.numero} - {c.nombre} ({c.banco_nombre || 'Banco'})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Número / Referencia Préstamo *</label>
                            <input
                                required
                                type="text"
                                value={formData.numero_prestamo}
                                onChange={e => setFormData({ ...formData, numero_prestamo: e.target.value.toUpperCase() })}
                                style={{ width: '100%', height: '42px', textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Descripción / Destino del Crédito *</label>
                            <input
                                required
                                type="text"
                                value={formData.descripcion}
                                onChange={e => setFormData({ ...formData, descripcion: e.target.value.toUpperCase() })}
                                style={{ width: '100%', height: '42px', textTransform: 'uppercase' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto Original ($) *</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min="1"
                                value={formData.monto_original}
                                onChange={e => setFormData({ ...formData, monto_original: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tasa de Interés Anual (%) *</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min="0.1"
                                value={formData.tasa_interes_anual}
                                onChange={e => setFormData({ ...formData, tasa_interes_anual: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Plazo (Meses) *</label>
                            <input
                                required
                                type="number"
                                min="1"
                                max="360"
                                value={formData.plazo_meses}
                                onChange={e => setFormData({ ...formData, plazo_meses: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Frecuencia de Pago</label>
                            <select
                                value={formData.frecuencia_pago}
                                onChange={e => setFormData({ ...formData, frecuencia_pago: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                {Object.entries(FREQUENCIES).map(([k, f]) => (
                                    <option key={k} value={k}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha de Desembolso / Inicio *</label>
                            <input
                                required
                                type="date"
                                value={formData.fecha_inicio}
                                onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha del Primer Pago *</label>
                            <input
                                required
                                type="date"
                                value={formData.fecha_primer_pago}
                                onChange={e => setFormData({ ...formData, fecha_primer_pago: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Cuota Regular Calculada ($) {autoCuota > 0 && <span style={{ color: 'var(--primary)' }}>(Sugerida: {formatCurrency(autoCuota)})</span>}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder={autoCuota.toString()}
                                value={formData.cuota_calculada}
                                onChange={e => setFormData({ ...formData, cuota_calculada: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Notas / Garantías</label>
                            <textarea
                                rows={2}
                                value={formData.notas}
                                onChange={e => setFormData({ ...formData, notas: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'transparent' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setShowFormModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle2 size={18} /> {editingLoan ? 'Actualizar Préstamo' : 'Registrar Préstamo'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Loan Detail & Amortization Modal */}
            {selectedLoan && (
                <Modal
                    open={showDetailModal}
                    onClose={() => setShowDetailModal(false)}
                    title={`Detalle del Préstamo: ${selectedLoan.numero_prestamo}`}
                    size="xl"
                >
                    <div>
                        {/* Summary Top Bar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Empresa / Banco</span>
                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedLoan.empresa_nombre}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedLoan.banco_nombre || 'Sin banco'}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monto Original</span>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatCurrency(selectedLoan.monto_original)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedLoan.tasa_interes_anual}% a {selectedLoan.plazo_meses}m</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--accent, #10b981)', textTransform: 'uppercase' }}>Capital Amortizado</span>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent, #10b981)' }}>{formatCurrency(selectedLoan.total_capital_pagado)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedLoan.porcentaje_amortizado}% completado</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase' }}>Saldo Pendiente</span>
                                <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#f87171' }}>{formatCurrency(selectedLoan.saldo_actual)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuota: {formatCurrency(selectedLoan.cuota_calculada)}</div>
                            </div>
                        </div>

                        {/* Detail Tabs */}
                        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setDetailTab('pagos')}
                                className={detailTab === 'pagos' ? 'btn-primary' : 'btn-secondary'}
                                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                            >
                                Historial de Pagos ({selectedLoan.pagos?.length || 0})
                            </button>
                            <button
                                type="button"
                                onClick={() => setDetailTab('amortizacion')}
                                className={detailTab === 'amortizacion' ? 'btn-primary' : 'btn-secondary'}
                                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                            >
                                Tabla de Amortización Programada
                            </button>
                            <button
                                type="button"
                                onClick={() => setDetailTab('simulador')}
                                className={detailTab === 'simulador' ? 'btn-primary' : 'btn-secondary'}
                                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <TrendingDown size={16} /> Simulador de Abonos a Capital
                            </button>
                        </div>

                        {/* TAB 1: Pagos Realizados */}
                        {detailTab === 'pagos' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <h4 style={{ margin: 0 }}>Registro de Pagos y Abonos Efectuados</h4>
                                    {selectedLoan.estado === 'activo' && (
                                        <button onClick={handleOpenPayment} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            <Plus size={16} /> Registrar Pago / Abono
                                        </button>
                                    )}
                                </div>

                                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    <table style={{ minWidth: '850px', width: '100%', fontSize: '0.825rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.5rem' }}>Fecha</th>
                                                <th style={{ padding: '0.5rem' }}>Tipo</th>
                                                <th style={{ padding: '0.5rem' }}>Comprobante</th>
                                                <th style={{ padding: '0.5rem' }}>Capital</th>
                                                <th style={{ padding: '0.5rem' }}>Interés</th>
                                                <th style={{ padding: '0.5rem' }}>Total Pagado</th>
                                                <th style={{ padding: '0.5rem' }}>Saldo Restante</th>
                                                <th style={{ padding: '0.5rem' }}>Usuario</th>
                                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!selectedLoan.pagos || selectedLoan.pagos.length === 0) ? (
                                                <tr>
                                                    <td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        No se han registrado pagos para este préstamo aún.
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedLoan.pagos.map(pago => (
                                                    <tr key={pago.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: '0.5rem' }}>{(pago.fecha_pago || '').split('T')[0]}</td>
                                                        <td style={{ padding: '0.5rem' }}>
                                                            <span style={{
                                                                padding: '0.15rem 0.5rem',
                                                                borderRadius: '10px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                background: pago.tipo_pago === 'abono_extraordinario' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                                color: pago.tipo_pago === 'abono_extraordinario' ? '#10b981' : '#3b82f6'
                                                            }}>
                                                                {pago.tipo_pago === 'abono_extraordinario' ? 'Abono Capital' : 'Cuota Regular'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{pago.numero_comprobante || '-'}</td>
                                                        <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--accent, #10b981)' }}>{formatCurrency(pago.monto_capital)}</td>
                                                        <td style={{ padding: '0.5rem', color: '#f87171' }}>{formatCurrency(pago.monto_interes)}</td>
                                                        <td style={{ padding: '0.5rem', fontWeight: 700 }}>{formatCurrency(pago.monto_total)}</td>
                                                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{formatCurrency(pago.saldo_restante)}</td>
                                                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{pago.usuario_registro || '-'}</td>
                                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                            <button onClick={() => handleDeletePayment(pago.id)} className="icon-btn" style={{ color: 'var(--danger, #ef4444)' }} title="Revertir este pago">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: Amortización Programada */}
                        {detailTab === 'amortizacion' && plannedAmortization && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <h4 style={{ margin: 0 }}>Tabla Original ({plannedAmortization.schedule.length} cuotas programadas)</h4>
                                </div>

                                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    <table style={{ minWidth: '850px', width: '100%', fontSize: '0.825rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.5rem' }}>#</th>
                                                <th style={{ padding: '0.5rem' }}>Fecha</th>
                                                <th style={{ padding: '0.5rem' }}>Cuota Total</th>
                                                <th style={{ padding: '0.5rem' }}>Capital</th>
                                                <th style={{ padding: '0.5rem' }}>Interés</th>
                                                <th style={{ padding: '0.5rem' }}>Saldo Restante</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {plannedAmortization.schedule.map(row => (
                                                <tr key={row.number} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{row.number}</td>
                                                    <td style={{ padding: '0.5rem' }}>{row.date}</td>
                                                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{formatCurrency(row.payment)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatCurrency(row.principal)}</td>
                                                    <td style={{ padding: '0.5rem', color: '#f87171' }}>{formatCurrency(row.interest)}</td>
                                                    <td style={{ padding: '0.5rem', fontWeight: 700 }}>{formatCurrency(row.balance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: Simulador de Abonos Extra para este Préstamo */}
                        {detailTab === 'simulador' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent, #10b981)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <TrendingDown size={20} /> Proyección con Pagos Adicionales a Capital
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Tu saldo actual pendiente es de <strong>{formatCurrency(selectedLoan.saldo_actual)}</strong>. Si aumentas tu abono por encima de la cuota fija mensual de <strong>{formatCurrency(selectedLoan.cuota_calculada)}</strong>, conoce cuánto tiempo antes terminarás de pagar este préstamo y cuánto dinero ahorrarás en intereses bancarios.
                                    </p>
                                </div>

                                <div className="card glass" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Abono Adicional Mensual a Capital ($)</label>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent, #10b981)' }}>
                                            +{formatCurrency(extraSimulatorMonthly)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={Math.max(1000, selectedLoan.cuota_calculada * 2)}
                                        step="25"
                                        value={extraSimulatorMonthly}
                                        onChange={e => setExtraSimulatorMonthly(parseFloat(e.target.value))}
                                        style={{ width: '100%', marginBottom: '0.5rem' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span>$0 (Solo cuota normal)</span>
                                        <span>+{formatCurrency(Math.max(1000, selectedLoan.cuota_calculada * 2))}</span>
                                    </div>
                                </div>

                                {activePayoffSimulation && basePayoffSimulation && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                        <div className="card glass" style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cuotas Restantes Estimadas</span>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                                                {activePayoffSimulation.remainingPeriods} cuotas
                                            </div>
                                            {extraSimulatorMonthly > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', marginTop: '0.2rem' }}>
                                                    {basePayoffSimulation.remainingPeriods - activePayoffSimulation.remainingPeriods} cuotas menos
                                                </div>
                                            )}
                                        </div>

                                        <div className="card glass" style={{ padding: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tiempo para Finalizar</span>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                                                {activePayoffSimulation.remainingMonths} meses
                                            </div>
                                            {extraSimulatorMonthly > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', marginTop: '0.2rem' }}>
                                                    ¡Te ahorras {(basePayoffSimulation.remainingMonths - activePayoffSimulation.remainingMonths).toFixed(1)} meses!
                                                </div>
                                            )}
                                        </div>

                                        <div className="card glass" style={{ padding: '1rem', border: extraSimulatorMonthly > 0 ? '1px solid rgba(16, 185, 129, 0.4)' : undefined }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--accent, #10b981)', textTransform: 'uppercase' }}>Ahorro en Intereses Futuros</span>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent, #10b981)' }}>
                                                {formatCurrency(Math.max(0, basePayoffSimulation.totalInterestRemaining - activePayoffSimulation.totalInterestRemaining))}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                Por realizar abonos adicionales
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {/* Register Payment Modal */}
            <Modal
                open={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                title="Registrar Pago o Abono a Capital"
                size="md"
            >
                <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tipo de Pago *</label>
                            <select
                                value={paymentForm.tipo_pago}
                                onChange={e => setPaymentForm({ ...paymentForm, tipo_pago: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="cuota_regular">Cuota Regular (Capital + Interés)</option>
                                <option value="abono_extraordinario">Abono Extraordinario a Capital Directo</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fecha del Pago *</label>
                            <input
                                required
                                type="date"
                                value={paymentForm.fecha_pago}
                                onChange={e => setPaymentForm({ ...paymentForm, fecha_pago: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto Total Pagado ($) *</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={paymentForm.monto_total}
                                onChange={e => {
                                    const val = e.target.value;
                                    setPaymentForm(prev => ({
                                        ...prev,
                                        monto_total: val,
                                        monto_capital: prev.tipo_pago === 'abono_extraordinario' ? val : prev.monto_capital
                                    }));
                                }}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto Abonado a Capital ($) *</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={paymentForm.monto_capital}
                                onChange={e => setPaymentForm({ ...paymentForm, monto_capital: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto Intereses ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={paymentForm.monto_interes}
                                onChange={e => setPaymentForm({ ...paymentForm, monto_interes: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>N° Comprobante / Transferencia / Cheque</label>
                            <input
                                type="text"
                                value={paymentForm.numero_comprobante}
                                onChange={e => setPaymentForm({ ...paymentForm, numero_comprobante: e.target.value.toUpperCase() })}
                                style={{ width: '100%', height: '42px', textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cuenta Bancaria Origen de los Fondos</label>
                            <select
                                value={paymentForm.cuenta_origen_id}
                                onChange={e => setPaymentForm({ ...paymentForm, cuenta_origen_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">(Opcional) Seleccione cuenta...</option>
                                {cuentas.map(c => (
                                    <option key={c.id} value={c.id}>{c.numero} - {c.nombre} ({c.banco_nombre || 'Banco'})</option>
                                ))}
                            </select>
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Notas u Observaciones</label>
                            <textarea
                                rows={2}
                                value={paymentForm.notas}
                                onChange={e => setPaymentForm({ ...paymentForm, notas: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'transparent' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle2 size={18} /> Confirmar Pago
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
