import React, { useState, useMemo } from 'react';
import { Calculator, DollarSign, Calendar, Percent, TrendingDown, ArrowRight, FileSpreadsheet, FileText, Plus, Trash2, CheckCircle2, Landmark, RefreshCw, ShieldCheck, PiggyBank, Coins } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import api from '../services/api';
import { calculatePMT, calculatePV, generateAmortizationSchedule, formatCurrency, FREQUENCIES, INSURANCE_TYPES, SAVINGS_TYPES, COMMISSION_TYPES } from '../utils/loanCalculations';

export default function FinanzasCalculadora() {
    const { addToast } = useToast();

    // Mode: 'pmt' (calculate payment) or 'pv' (calculate loan amount)
    const [calcMode, setCalcMode] = useState('pmt');

    // Input values
    const [loanAmount, setLoanAmount] = useState(50000);
    const [targetPayment, setTargetPayment] = useState(1050);
    const [annualRate, setAnnualRate] = useState(9.5);
    const [termMonths, setTermMonths] = useState(60);
    const [frequency, setFrequency] = useState('mensual');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

    // Additional Charges: Seguro, Ahorro Obligatorio & Comisión por Desembolso
    const [commissionType, setCommissionType] = useState('none');
    const [commissionValue, setCommissionValue] = useState(0);
    const [insuranceType, setInsuranceType] = useState('none');
    const [insuranceValue, setInsuranceValue] = useState(0);
    const [savingsType, setSavingsType] = useState('none');
    const [savingsValue, setSavingsValue] = useState(0);

    // Extra payments
    const [extraMonthly, setExtraMonthly] = useState(100);
    const [customExtras, setCustomExtras] = useState([]);
    const [newExtraPeriod, setNewExtraPeriod] = useState(12);
    const [newExtraAmount, setNewExtraAmount] = useState(1000);

    // Save as Loan Modal
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [empresas, setEmpresas] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [saveForm, setSaveForm] = useState({
        empresa_id: '',
        banco_id: '',
        numero_prestamo: '',
        descripcion: 'PRÉSTAMO BANCARIO FINANCIERO',
        notas: ''
    });
    const [savingLoan, setSavingLoan] = useState(false);

    // Dynamic calculation
    const effectivePrincipal = useMemo(() => {
        if (calcMode === 'pv') {
            return calculatePV(targetPayment, annualRate, termMonths, frequency);
        }
        return loanAmount;
    }, [calcMode, targetPayment, loanAmount, annualRate, termMonths, frequency]);

    const hasCommission = commissionType !== 'none' && parseFloat(commissionValue) > 0;
    const hasInsurance = insuranceType !== 'none' && parseFloat(insuranceValue) > 0;
    const hasSavings = savingsType !== 'none' && parseFloat(savingsValue) > 0;
    const hasCharges = hasInsurance || hasSavings || hasCommission;

    const result = useMemo(() => {
        return generateAmortizationSchedule({
            principal: effectivePrincipal,
            annualRate,
            termMonths,
            frequency,
            startDate,
            extraPaymentMonthly: extraMonthly,
            extraPaymentsCustom: customExtras,
            insuranceType,
            insuranceValue,
            savingsType,
            savingsValue,
            commissionType,
            commissionValue
        });
    }, [effectivePrincipal, annualRate, termMonths, frequency, startDate, extraMonthly, customExtras, insuranceType, insuranceValue, savingsType, savingsValue, commissionType, commissionValue]);

    const handleAddCustomExtra = () => {
        const period = parseInt(newExtraPeriod, 10);
        const amount = parseFloat(newExtraAmount);
        if (!period || period <= 0 || !amount || amount <= 0) {
            return addToast('Ingrese un número de cuota y monto válidos', 'warning');
        }
        if (customExtras.some(e => e.periodNumber === period)) {
            return addToast(`Ya existe un abono extraordinario programado en la cuota ${period}`, 'warning');
        }
        setCustomExtras([...customExtras, { periodNumber: period, amount }]);
        addToast(`Abono extraordinario agregado para la cuota #${period}`, 'success');
    };

    const handleRemoveCustomExtra = (periodNumber) => {
        setCustomExtras(customExtras.filter(e => e.periodNumber !== periodNumber));
    };

    // Open Save Modal
    const handleOpenSaveModal = async () => {
        try {
            const { data } = await api.get('/finanzas/catalogos');
            setEmpresas(data.empresas || []);
            setBancos(data.bancos || []);
            setSaveForm(prev => ({
                ...prev,
                empresa_id: data.empresas?.[0]?.id ? String(data.empresas[0].id) : '',
                banco_id: data.bancos?.[0]?.id ? String(data.bancos[0].id) : '',
                numero_prestamo: `PREST-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
            }));
            setShowSaveModal(true);
        } catch (error) {
            addToast('Error al cargar catálogos para registrar préstamo: ' + (error.response?.data?.message || error.message), 'error');
        }
    };

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        if (!saveForm.empresa_id || !saveForm.numero_prestamo || !saveForm.descripcion) {
            return addToast('Complete los campos requeridos (*)', 'warning');
        }
        setSavingLoan(true);
        try {
            await api.post('/finanzas/prestamos', {
                empresa_id: parseInt(saveForm.empresa_id, 10),
                banco_id: saveForm.banco_id ? parseInt(saveForm.banco_id, 10) : null,
                numero_prestamo: saveForm.numero_prestamo.trim().toUpperCase(),
                descripcion: saveForm.descripcion.trim().toUpperCase(),
                monto_original: parseFloat(effectivePrincipal),
                tasa_interes_anual: parseFloat(annualRate),
                plazo_meses: parseInt(termMonths, 10),
                frecuencia_pago: frequency,
                fecha_inicio: startDate,
                fecha_primer_pago: startDate,
                cuota_calculada: result.summary.regularPayment,
                seguro_tipo: insuranceType,
                seguro_valor: parseFloat(insuranceValue) || 0,
                seguro_cuota: result.summary.firstPeriodInsurance,
                ahorro_tipo: savingsType,
                ahorro_valor: parseFloat(savingsValue) || 0,
                ahorro_cuota: result.summary.firstPeriodSavings,
                cuota_total: result.summary.firstPeriodTotalPayment,
                comision_tipo: commissionType,
                comision_valor: parseFloat(commissionValue) || 0,
                comision_monto: result.summary.disbursementCommission,
                monto_neto_desembolsado: result.summary.netDisbursedAmount,
                notas: saveForm.notas
            });
            addToast('¡Préstamo registrado exitosamente en el sistema!', 'success');
            setShowSaveModal(false);
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Error al guardar préstamo';
            addToast(errorMsg, 'error');
        } finally {
            setSavingLoan(false);
        }
    };

    // Export to Excel according to ui_standards.md
    const exportToExcel = () => {
        if (result.schedule.length === 0) return;
        const exportData = result.schedule.map(row => {
            const item = {
                'Cuota #': row.number,
                'Fecha Estimada': row.date,
                'Cuota Base': row.payment,
                'Capital': row.principal,
                'Interés': row.interest,
                'Abono Extra': row.extraPrincipal
            };
            if (hasInsurance) item['Seguro'] = row.insurance;
            if (hasSavings) item['Ahorro Obligatorio'] = row.savings;
            if (hasCharges) item['Cuota Total con Cargos'] = row.totalWithCharges;
            item['Saldo Restante'] = row.balance;
            item['Interés Acumulado'] = row.accumulatedInterest;
            return item;
        });

        // Summary sheet data
        const summaryData = [
            { 'Parámetro': 'Monto Solicitado', 'Valor': formatCurrency(effectivePrincipal) },
            { 'Parámetro': 'Tasa de Interés Anual', 'Valor': `${annualRate}%` },
            { 'Parámetro': 'Plazo', 'Valor': `${termMonths} meses` },
            { 'Parámetro': 'Frecuencia de Pago', 'Valor': FREQUENCIES[frequency]?.label || frequency },
            { 'Parámetro': 'Cuota Base Regular', 'Valor': formatCurrency(result.summary.regularPayment) },
            { 'Parámetro': 'Comisión por Desembolso', 'Valor': formatCurrency(result.summary.disbursementCommission) },
            { 'Parámetro': 'Monto Neto Líquido Recibido', 'Valor': formatCurrency(result.summary.netDisbursedAmount) },
            { 'Parámetro': 'Total Intereses Proyectados', 'Valor': formatCurrency(result.summary.totalInterest) },
            { 'Parámetro': 'Total Seguros', 'Valor': formatCurrency(result.summary.totalInsurance) },
            { 'Parámetro': 'Total Ahorro Acumulado', 'Valor': formatCurrency(result.summary.totalSavings) },
            { 'Parámetro': 'Costo Total del Crédito', 'Valor': formatCurrency(result.summary.totalCostOfLoan) }
        ];

        const workbook = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        const wsSchedule = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(workbook, wsSummary, "Resumen Condiciones");
        XLSX.utils.book_append_sheet(workbook, wsSchedule, "Amortizacion");
        XLSX.writeFile(workbook, `Tabla_Amortizacion_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Export to PDF according to ui_standards.md
    const exportToPDF = () => {
        if (result.schedule.length === 0) return;
        const doc = new jsPDF('landscape');
        const title = 'Tabla de Amortización del Préstamo';

        doc.setFontSize(15);
        doc.text(title, 14, 15);
        doc.setFontSize(9);
        let subtitle = `Monto: ${formatCurrency(effectivePrincipal)} | Tasa: ${annualRate}% | Plazo: ${termMonths} meses | Frecuencia: ${FREQUENCIES[frequency]?.label || frequency}`;
        if (hasCommission) {
            subtitle += ` | Comisión: ${formatCurrency(result.summary.disbursementCommission)} | Desembolso Neto: ${formatCurrency(result.summary.netDisbursedAmount)}`;
        }
        if (hasInsurance || hasSavings) {
            subtitle += ` | Cuota Total: ${formatCurrency(result.summary.firstPeriodTotalPayment)}`;
        }
        doc.text(subtitle, 14, 22);

        const tableColumn = ['Cuota #', 'Fecha', 'Cuota Base', 'Capital', 'Interés', 'Abono Extra'];
        if (hasInsurance) tableColumn.push('Seguro');
        if (hasSavings) tableColumn.push('Ahorro');
        if (hasCharges) tableColumn.push('Cuota Total');
        tableColumn.push('Saldo Restante');

        const tableRows = result.schedule.map(row => {
            const r = [
                row.number,
                row.date,
                formatCurrency(row.payment),
                formatCurrency(row.principal),
                formatCurrency(row.interest),
                formatCurrency(row.extraPrincipal)
            ];
            if (hasInsurance) r.push(formatCurrency(row.insurance));
            if (hasSavings) r.push(formatCurrency(row.savings));
            if (hasCharges) r.push(formatCurrency(row.totalWithCharges));
            r.push(formatCurrency(row.balance));
            return r;
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        doc.save(`Tabla_Amortizacion_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    // Prepare chart points for SVG
    const maxBalance = effectivePrincipal > 0 ? effectivePrincipal : 1;
    const schedulePoints = result.schedule;
    const origPoints = result.originalSchedule;
    const [chartHover, setChartHover] = useState(null);

    const formatChartCurrency = (val) => {
        if (val <= 0) return '$0';
        if (val >= 1000000) {
            const m = val / 1000000;
            return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
        }
        if (val >= 10000) {
            const k = val / 1000;
            return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}k`;
        }
        return `$${Math.round(val)}`;
    };

    const xMilestones = useMemo(() => {
        if (!origPoints || origPoints.length < 2) return [];
        const totalPeriods = origPoints.length - 1;
        const count = 5;
        const list = [];
        const periodsPerYear = frequency === 'quincenal' ? 24 : frequency === 'semanal' ? 52 : 12;

        for (let i = 0; i <= count; i++) {
            const idx = Math.min(totalPeriods, Math.round((i / count) * totalPeriods));
            const row = origPoints[idx];
            const x = 90 + (idx / totalPeriods) * 760;
            const yearsElapsed = (idx / periodsPerYear).toFixed(1);
            const cleanYear = yearsElapsed.endsWith('.0') ? parseInt(yearsElapsed, 10) : yearsElapsed;
            const calYear = row?.date ? row.date.split('-')[0] : '';

            list.push({
                idx,
                x,
                yearLabel: `Año ${cleanYear}`,
                subLabel: calYear ? `(${calYear})` : `Cuota ${idx}`,
                date: row?.date
            });
        }
        return list;
    }, [origPoints, frequency]);

    const yLevels = useMemo(() => {
        return [
            { pct: 1.0, val: maxBalance },
            { pct: 0.75, val: maxBalance * 0.75 },
            { pct: 0.50, val: maxBalance * 0.50 },
            { pct: 0.25, val: maxBalance * 0.25 },
            { pct: 0.0, val: 0 }
        ];
    }, [maxBalance]);

    // Handle hover on SVG
    const handleChartMouseMove = (e) => {
        if (!origPoints || origPoints.length < 2) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const svgX = (clientX / rect.width) * 880;

        if (svgX < 90 || svgX > 850) {
            setChartHover(null);
            return;
        }

        const ratio = (svgX - 90) / 760;
        const targetIdx = Math.max(0, Math.min(origPoints.length - 1, Math.round(ratio * (origPoints.length - 1))));
        const origPt = origPoints[targetIdx];
        const schedPt = schedulePoints[targetIdx] || null;

        setChartHover({
            index: targetIdx,
            x: 90 + (targetIdx / (origPoints.length - 1)) * 760,
            orig: origPt,
            sched: schedPt
        });
    };

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Calculator size={28} color="var(--primary)" /> Calculadora de Amortización del Préstamo
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Simula préstamos bancarios, proyecta abonos extraordinarios a capital, calcula el ahorro en intereses y conoce la fecha exacta de liquidación anticipada.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={handleOpenSaveModal} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Landmark size={18} /> Guardar como Préstamo
                    </button>
                    <button onClick={exportToExcel} disabled={result.schedule.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} disabled={result.schedule.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Mode Switcher */}
            <div className="card glass" style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Modo de Cálculo:</span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setCalcMode('pmt')}
                        className={calcMode === 'pmt' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                    >
                        Calcular Cuota Mensual (Dado el Monto)
                    </button>
                    <button
                        type="button"
                        onClick={() => setCalcMode('pv')}
                        className={calcMode === 'pv' ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                    >
                        Calcular Monto Financiable (Dada la Cuota)
                    </button>
                </div>
            </div>

            {/* Top Grid: Controls + KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Inputs Card */}
                <div className="card glass" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                        <DollarSign size={20} color="var(--primary)" /> Parámetros del Préstamo
                    </h3>

                    <div className="form-grid form-grid-2">
                        {calcMode === 'pmt' ? (
                            <div className="span-2">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Monto del Préstamo ($)</label>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(loanAmount)}</span>
                                </div>
                                <input
                                    type="number"
                                    step="500"
                                    min="100"
                                    value={loanAmount}
                                    onChange={e => setLoanAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                                    style={{ width: '100%', height: '42px', marginBottom: '0.4rem' }}
                                />
                                <input
                                    type="range"
                                    min="1000"
                                    max="500000"
                                    step="1000"
                                    value={loanAmount}
                                    onChange={e => setLoanAmount(parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ) : (
                            <div className="span-2">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cuota Deseada ($)</label>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(targetPayment)}</span>
                                </div>
                                <input
                                    type="number"
                                    step="50"
                                    min="10"
                                    value={targetPayment}
                                    onChange={e => setTargetPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                                    style={{ width: '100%', height: '42px', marginBottom: '0.4rem' }}
                                />
                                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.2rem' }}>
                                    Monto financiable calculado: <strong>{formatCurrency(effectivePrincipal)}</strong>
                                </div>
                            </div>
                        )}

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tasa de Interés Anual (%)</label>
                                <span style={{ fontWeight: 600 }}>{annualRate}%</span>
                            </div>
                            <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="40"
                                value={annualRate}
                                onChange={e => setAnnualRate(Math.max(0.1, parseFloat(e.target.value) || 0))}
                                style={{ width: '100%', height: '42px', marginBottom: '0.4rem' }}
                            />
                            <input
                                type="range"
                                min="1"
                                max="30"
                                step="0.25"
                                value={annualRate}
                                onChange={e => setAnnualRate(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Plazo (Meses)</label>
                                <span style={{ fontWeight: 600 }}>{termMonths} meses ({(termMonths / 12).toFixed(1)} años)</span>
                            </div>
                            <input
                                type="number"
                                step="6"
                                min="1"
                                max="360"
                                value={termMonths}
                                onChange={e => setTermMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                style={{ width: '100%', height: '42px', marginBottom: '0.4rem' }}
                            />
                            <input
                                type="range"
                                min="6"
                                max="180"
                                step="6"
                                value={termMonths}
                                onChange={e => setTermMonths(parseInt(e.target.value, 10))}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Frecuencia de Pago</label>
                            <select
                                value={frequency}
                                onChange={e => setFrequency(e.target.value)}
                                style={{ width: '100%', height: '42px' }}
                            >
                                {Object.entries(FREQUENCIES).map(([key, f]) => (
                                    <option key={key} value={key}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Fecha del Primer Pago</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ width: '100%', height: '42px' }}
                            />
                        </div>

                        {/* Additional Charges: Comisión por Desembolso, Seguro & Ahorro Obligatorio */}
                        <div style={{
                            gridColumn: '1 / -1',
                            borderTop: '1px solid var(--border)',
                            paddingTop: '1.25rem',
                            marginTop: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.925rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <ShieldCheck size={18} color="var(--primary)" /> Comisión por Desembolso, Seguros y Aportación (Opcional)
                                </span>
                                {hasCharges && (
                                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.15)', color: 'var(--primary)', fontWeight: 600 }}>
                                        + Cargos / Comisiones Activas
                                    </span>
                                )}
                            </div>

                            <div className="form-grid form-grid-3">
                                {/* Comisión por Desembolso */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                                    <label style={{ fontSize: '0.825rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                                        <Coins size={16} color="#f59e0b" /> Comisión por Desembolso
                                    </label>
                                    <select
                                        value={commissionType}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setCommissionType(val);
                                            if (val === 'none') setCommissionValue(0);
                                            else if (val === 'percent' && commissionValue === 0) setCommissionValue(2.0);
                                            else if (val === 'fixed' && commissionValue === 0) setCommissionValue(500);
                                        }}
                                        style={{ width: '100%', height: '38px', marginBottom: commissionType !== 'none' ? '0.5rem' : 0, fontSize: '0.85rem' }}
                                    >
                                        {Object.entries(COMMISSION_TYPES).map(([key, opt]) => (
                                            <option key={key} value={key}>{opt.label}</option>
                                        ))}
                                    </select>

                                    {commissionType !== 'none' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                <span>{COMMISSION_TYPES[commissionType]?.isPercent ? 'Porcentaje de Comisión (%)' : 'Monto de Comisión ($)'}</span>
                                                <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                                                    {formatCurrency(result.summary.disbursementCommission)}
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                step={COMMISSION_TYPES[commissionType]?.isPercent ? "0.25" : "50"}
                                                min="0"
                                                value={commissionValue}
                                                onChange={e => setCommissionValue(Math.max(0, parseFloat(e.target.value) || 0))}
                                                placeholder={COMMISSION_TYPES[commissionType]?.placeholder}
                                                style={{ width: '100%', height: '38px', fontSize: '0.85rem', marginBottom: '0.35rem' }}
                                            />
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '0.3rem' }}>
                                                <span>Líquido a recibir:</span>
                                                <strong style={{ color: '#10b981' }}>{formatCurrency(result.summary.netDisbursedAmount)}</strong>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Seguro */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                                    <label style={{ fontSize: '0.825rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                                        <ShieldCheck size={16} color="#3b82f6" /> Seguro de Deuda / Vida
                                    </label>
                                    <select
                                        value={insuranceType}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setInsuranceType(val);
                                            if (val === 'none') setInsuranceValue(0);
                                            else if (val === 'fixed' && insuranceValue === 0) setInsuranceValue(15);
                                            else if ((val === 'percent_balance' || val === 'percent_original') && insuranceValue === 0) setInsuranceValue(0.60);
                                        }}
                                        style={{ width: '100%', height: '38px', marginBottom: insuranceType !== 'none' ? '0.5rem' : 0, fontSize: '0.85rem' }}
                                    >
                                        {Object.entries(INSURANCE_TYPES).map(([key, opt]) => (
                                            <option key={key} value={key}>{opt.label}</option>
                                        ))}
                                    </select>

                                    {insuranceType !== 'none' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                <span>{INSURANCE_TYPES[insuranceType]?.isPercent ? 'Tasa Porcentual Anual (%)' : 'Monto Fijo por Cuota ($)'}</span>
                                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                                    1ª cuota: ~{formatCurrency(result.summary.firstPeriodInsurance)}
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                step={INSURANCE_TYPES[insuranceType]?.isPercent ? "0.05" : "1"}
                                                min="0"
                                                value={insuranceValue}
                                                onChange={e => setInsuranceValue(Math.max(0, parseFloat(e.target.value) || 0))}
                                                placeholder={INSURANCE_TYPES[insuranceType]?.placeholder}
                                                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Ahorro Obligatorio */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                                    <label style={{ fontSize: '0.825rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                                        <PiggyBank size={16} color="#10b981" /> Ahorro Obligatorio / Aportación
                                    </label>
                                    <select
                                        value={savingsType}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setSavingsType(val);
                                            if (val === 'none') setSavingsValue(0);
                                            else if (val === 'fixed' && savingsValue === 0) setSavingsValue(20);
                                            else if (val === 'percent_payment' && savingsValue === 0) setSavingsValue(5);
                                        }}
                                        style={{ width: '100%', height: '38px', marginBottom: savingsType !== 'none' ? '0.5rem' : 0, fontSize: '0.85rem' }}
                                    >
                                        {Object.entries(SAVINGS_TYPES).map(([key, opt]) => (
                                            <option key={key} value={key}>{opt.label}</option>
                                        ))}
                                    </select>

                                    {savingsType !== 'none' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                <span>{SAVINGS_TYPES[savingsType]?.isPercent ? 'Porcentaje de la Cuota (%)' : 'Monto Fijo por Cuota ($)'}</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                    1ª cuota: ~{formatCurrency(result.summary.firstPeriodSavings)}
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                step={SAVINGS_TYPES[savingsType]?.isPercent ? "0.5" : "1"}
                                                min="0"
                                                value={savingsValue}
                                                onChange={e => setSavingsValue(Math.max(0, parseFloat(e.target.value) || 0))}
                                                placeholder={SAVINGS_TYPES[savingsType]?.placeholder}
                                                style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Extra Payments Card */}
                <div className="card glass" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--accent, #10b981)' }}>
                        <TrendingDown size={20} /> Abonos Extraordinarios a Capital
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
                        Abonar más de la cuota regular reduce el saldo deudor directamente, disminuye intereses y te permite liquidar el préstamo mucho antes.
                    </p>

                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Abono Adicional Recurrente por Cuota ($)</label>
                            <span style={{ fontWeight: 600, color: 'var(--accent, #10b981)' }}>+{formatCurrency(extraMonthly)}</span>
                        </div>
                        <input
                            type="number"
                            step="25"
                            min="0"
                            value={extraMonthly}
                            onChange={e => setExtraMonthly(Math.max(0, parseFloat(e.target.value) || 0))}
                            style={{ width: '100%', height: '42px', marginBottom: '0.4rem' }}
                        />
                        <input
                            type="range"
                            min="0"
                            max="1500"
                            step="25"
                            value={extraMonthly}
                            onChange={e => setExtraMonthly(parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                            Abono Extraordinario Único (Lump Sum)
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '110px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>En Cuota #</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={termMonths}
                                    value={newExtraPeriod}
                                    onChange={e => setNewExtraPeriod(e.target.value)}
                                    style={{ width: '100%', height: '38px' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '130px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto Extra ($)</label>
                                <input
                                    type="number"
                                    min="50"
                                    step="100"
                                    value={newExtraAmount}
                                    onChange={e => setNewExtraAmount(e.target.value)}
                                    style={{ width: '100%', height: '38px' }}
                                />
                            </div>
                            <div style={{ alignSelf: 'flex-end' }}>
                                <button type="button" onClick={handleAddCustomExtra} className="btn-secondary" style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Plus size={16} /> Programar
                                </button>
                            </div>
                        </div>

                        {/* List of custom extras */}
                        {customExtras.length > 0 && (
                            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {customExtras.map(ex => (
                                    <div key={ex.periodNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--border-radius)', fontSize: '0.85rem' }}>
                                        <span>Cuota #{ex.periodNumber}: <strong>+{formatCurrency(ex.amount)}</strong></span>
                                        <button type="button" onClick={() => handleRemoveCustomExtra(ex.periodNumber)} className="icon-btn" style={{ color: 'var(--danger, #ef4444)' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        {hasCharges ? 'Cuota Total a Pagar' : 'Cuota Regular / Total'}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--primary)' }}>
                        {formatCurrency(hasCharges ? result.summary.firstPeriodTotalPayment : result.summary.regularPayment)}
                    </div>
                    {hasCharges && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span>Base: <strong>{formatCurrency(result.summary.regularPayment)}</strong></span>
                            {hasInsurance && <span style={{ color: '#60a5fa' }}>+ Seg: {formatCurrency(result.summary.firstPeriodInsurance)}</span>}
                            {hasSavings && <span style={{ color: '#34d399' }}>+ Ahorro: {formatCurrency(result.summary.firstPeriodSavings)}</span>}
                        </div>
                    )}
                    {extraMonthly > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', marginTop: '0.25rem' }}>
                            Con abono: <strong>{formatCurrency((hasCharges ? result.summary.firstPeriodTotalPayment : result.summary.regularPayment) + extraMonthly)}</strong>
                        </div>
                    )}
                </div>

                {hasCommission && (
                    <div className="card glass" style={{ padding: '1.25rem', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Líquido a Recibir</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>
                            {formatCurrency(result.summary.netDisbursedAmount)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Comisión ({commissionType === 'percent' ? `${commissionValue}%` : 'fija'}): <span style={{ color: '#f59e0b', fontWeight: 600 }}>-{formatCurrency(result.summary.disbursementCommission)}</span>
                        </div>
                    </div>
                )}

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Intereses Totales</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                        {formatCurrency(result.summary.totalInterest)}
                    </div>
                    {result.summary.interestSaved > 0 && (
                        <div style={{ fontSize: '0.8rem', textDecoration: 'line-through', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Sin abonos: {formatCurrency(result.summary.originalTotalInterest)}
                        </div>
                    )}
                </div>

                {(hasInsurance || hasSavings) && (
                    <div className="card glass" style={{ padding: '1.25rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Seguros y Ahorros</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>
                            {formatCurrency(result.summary.totalInsurance + result.summary.totalSavings)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {hasInsurance && <div>Seguros: {formatCurrency(result.summary.totalInsurance)}</div>}
                            {hasSavings && <div>Ahorro acumulado: {formatCurrency(result.summary.totalSavings)}</div>}
                        </div>
                    </div>
                )}

                <div className="card glass" style={{ padding: '1.25rem', border: result.summary.interestSaved > 0 ? '1px solid rgba(16, 185, 129, 0.4)' : undefined }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Ahorro en Intereses</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent, #10b981)' }}>
                        {formatCurrency(result.summary.interestSaved)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Dinero no pagado al banco
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem', border: result.summary.monthsSaved > 0 ? '1px solid rgba(59, 130, 246, 0.4)' : undefined }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Tiempo Ahorrado</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {result.summary.monthsSaved > 0 ? `${result.summary.monthsSaved} meses` : '0 meses'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {result.summary.periodsSaved > 0 ? `${result.summary.periodsSaved} cuotas menos` : 'Plazo completo'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Fecha de Liquidación</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>
                        {result.summary.payoffDate || 'N/A'}
                    </div>
                    {result.summary.originalPayoffDate && result.summary.payoffDate !== result.summary.originalPayoffDate && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Original: {result.summary.originalPayoffDate}
                        </div>
                    )}
                </div>
            </div>

            {/* Visual SVG Chart: Reduction of Balance */}
            <div className="card glass" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Percent size={18} color="var(--primary)" /> Curva de Amortización del Saldo Deudor
                        </h3>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Evolución proyectada del saldo deudor a lo largo del tiempo (Años y Cantidad $)
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ display: 'inline-block', width: '16px', height: '3px', background: '#94a3b8', borderRadius: '2px', borderTop: '2px dashed #94a3b8' }}></span> Plan Regular
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ display: 'inline-block', width: '16px', height: '3px', background: '#10b981', borderRadius: '2px' }}></span> Con Abonos Extra
                        </span>
                    </div>
                </div>

                {/* SVG Container with horizontal scroll for small screens */}
                <div 
                    style={{ width: '100%', position: 'relative', overflowX: 'auto', paddingBottom: '0.5rem' }}
                    onMouseLeave={() => setChartHover(null)}
                >
                    <svg 
                        viewBox="0 0 880 255" 
                        style={{ width: '100%', minWidth: '650px', height: 'auto', display: 'block' }}
                        onMouseMove={handleChartMouseMove}
                        onMouseLeave={() => setChartHover(null)}
                    >
                        <defs>
                            <linearGradient id="chartGreenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="chartSlateGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.12" />
                                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.0" />
                            </linearGradient>
                        </defs>

                        {/* Y-Axis Header */}
                        <text x="85" y="16" textAnchor="end" fill="var(--text-muted)" fontSize="10" fontWeight="700">
                            CANTIDAD ($)
                        </text>

                        {/* Horizontal Gridlines & Y-Axis Amount Labels */}
                        {yLevels.map((lvl, idx) => {
                            const y = 25 + (1 - lvl.pct) * 175;
                            const isBaseline = lvl.pct === 0;
                            return (
                                <g key={idx}>
                                    <line
                                        x1="90"
                                        y1={y}
                                        x2="850"
                                        y2={y}
                                        stroke={isBaseline ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}
                                        strokeWidth={isBaseline ? 1.5 : 1}
                                        strokeDasharray={isBaseline ? 'none' : '4 4'}
                                    />
                                    <text
                                        x="82"
                                        y={y + 4}
                                        textAnchor="end"
                                        fill={isBaseline ? 'var(--text-color, #e2e8f0)' : 'var(--text-muted, #94a3b8)'}
                                        fontSize="11"
                                        fontWeight="600"
                                    >
                                        {formatChartCurrency(lvl.val)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Y-Axis Line */}
                        <line x1="90" y1="25" x2="90" y2="200" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

                        {/* Area under regular curve */}
                        {origPoints.length > 1 && (
                            <path
                                d={`M 90 200 ${origPoints.reduce((acc, pt, idx) => {
                                    const x = 90 + (idx / (origPoints.length - 1)) * 760;
                                    const y = 200 - ((pt.balance / maxBalance) * 175);
                                    return `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')} L 850 200 Z`}
                                fill="url(#chartSlateGrad)"
                            />
                        )}

                        {/* Regular Plan Line (Dashed Slate) */}
                        {origPoints.length > 1 && (
                            <path
                                d={origPoints.reduce((acc, pt, idx) => {
                                    const x = 90 + (idx / (origPoints.length - 1)) * 760;
                                    const y = 200 - ((pt.balance / maxBalance) * 175);
                                    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                            />
                        )}

                        {/* Area under accelerated curve */}
                        {schedulePoints.length > 1 && (
                            <path
                                d={`M 90 200 ${schedulePoints.reduce((acc, pt, idx) => {
                                    const x = 90 + (idx / (origPoints.length - 1)) * 760;
                                    const y = 200 - ((pt.balance / maxBalance) * 175);
                                    return `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')} L ${(90 + ((schedulePoints.length - 1) / (origPoints.length - 1)) * 760).toFixed(1)} 200 Z`}
                                fill="url(#chartGreenGrad)"
                            />
                        )}

                        {/* Accelerated Plan Line (Solid Green) */}
                        {schedulePoints.length > 1 && (
                            <path
                                d={schedulePoints.reduce((acc, pt, idx) => {
                                    const x = 90 + (idx / (origPoints.length - 1)) * 760;
                                    const y = 200 - ((pt.balance / maxBalance) * 175);
                                    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                            />
                        )}

                        {/* Early payoff marker dot if accelerated payoff finishes early */}
                        {schedulePoints.length > 1 && schedulePoints.length < origPoints.length && (
                            <g>
                                {(() => {
                                    const lastIdx = schedulePoints.length - 1;
                                    const lx = 90 + (lastIdx / (origPoints.length - 1)) * 760;
                                    return (
                                        <g>
                                            <circle cx={lx} cy="200" r="6" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                                            <circle cx={lx} cy="200" r="10" fill="none" stroke="#10b981" strokeWidth="1" strokeOpacity="0.6" />
                                            <text x={lx} y="190" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="700">
                                                Liquidado (Cuota #{schedulePoints[lastIdx].number})
                                            </text>
                                        </g>
                                    );
                                })()}
                            </g>
                        )}

                        {/* X-Axis Milestones: Years and Calendar Years */}
                        {xMilestones.map((m, idx) => (
                            <g key={idx}>
                                <line x1={m.x} y1="200" x2={m.x} y2="206" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                                <text
                                    x={m.x}
                                    y="222"
                                    textAnchor="middle"
                                    fill="var(--text-color, #e2e8f0)"
                                    fontSize="11"
                                    fontWeight="700"
                                >
                                    {m.yearLabel}
                                </text>
                                <text
                                    x={m.x}
                                    y="237"
                                    textAnchor="middle"
                                    fill="var(--text-muted, #94a3b8)"
                                    fontSize="9.5"
                                    fontWeight="500"
                                >
                                    {m.subLabel}
                                </text>
                            </g>
                        ))}

                        {/* X-Axis Title */}
                        <text x="850" y="248" textAnchor="end" fill="var(--text-muted)" fontSize="10" fontWeight="700">
                            TIEMPO / PLAZO &rarr;
                        </text>

                        {/* Interactive Hover Guide */}
                        {chartHover && (
                            <g>
                                <line
                                    x1={chartHover.x}
                                    y1="25"
                                    x2={chartHover.x}
                                    y2="200"
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="2 2"
                                />
                                {chartHover.orig && (
                                    <circle
                                        cx={chartHover.x}
                                        cy={200 - ((chartHover.orig.balance / maxBalance) * 175)}
                                        r="4"
                                        fill="#94a3b8"
                                        stroke="#ffffff"
                                        strokeWidth="1.5"
                                    />
                                )}
                                {chartHover.sched && (
                                    <circle
                                        cx={chartHover.x}
                                        cy={200 - ((chartHover.sched.balance / maxBalance) * 175)}
                                        r="5"
                                        fill="#10b981"
                                        stroke="#ffffff"
                                        strokeWidth="1.5"
                                    />
                                )}
                            </g>
                        )}
                    </svg>
                </div>

                {/* Floating summary badge when hovering over chart */}
                {chartHover && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.6rem 1rem',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--border-radius)',
                        display: 'flex',
                        gap: '1.5rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        fontSize: '0.85rem'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Cuota / Fecha: </span>
                            <strong>#{chartHover.orig.number} &mdash; {chartHover.orig.date}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#94a3b8' }}>Saldo Plan Regular: </span>
                            <strong>{formatCurrency(chartHover.orig.balance)}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#10b981' }}>Saldo Con Abonos: </span>
                            <strong>{chartHover.sched ? formatCurrency(chartHover.sched.balance) : '$0.00 (Liquidado)'}</strong>
                        </div>
                        {chartHover.sched && chartHover.orig.balance > chartHover.sched.balance && (
                            <div style={{ color: 'var(--accent, #10b981)' }}>
                                Capital Acelerado: <strong>+{formatCurrency(chartHover.orig.balance - chartHover.sched.balance)}</strong>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Schedule Table */}
            <div className="card glass table-responsive" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                        Tabla de Amortización Proyectada ({result.schedule.length} cuotas)
                    </h3>
                </div>

                <table style={{ minWidth: hasCharges ? '1100px' : '950px', width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.6rem' }}>#</th>
                            <th style={{ padding: '0.6rem' }}>Fecha</th>
                            <th style={{ padding: '0.6rem' }}>Cuota Base</th>
                            <th style={{ padding: '0.6rem' }}>Capital Regular</th>
                            <th style={{ padding: '0.6rem' }}>Interés</th>
                            <th style={{ padding: '0.6rem', color: 'var(--accent, #10b981)' }}>Abono Extra</th>
                            {hasInsurance && <th style={{ padding: '0.6rem', color: '#60a5fa' }}>Seguro</th>}
                            {hasSavings && <th style={{ padding: '0.6rem', color: '#34d399' }}>Ahorro</th>}
                            {hasCharges && <th style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>Cuota Total</th>}
                            <th style={{ padding: '0.6rem' }}>Capital Total</th>
                            <th style={{ padding: '0.6rem' }}>Saldo Restante</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.schedule.map(row => (
                            <tr key={row.number} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '0.55rem', fontWeight: 600 }}>{row.number}</td>
                                <td style={{ padding: '0.55rem' }}>{row.date}</td>
                                <td style={{ padding: '0.55rem', fontWeight: 600 }}>{formatCurrency(row.payment)}</td>
                                <td style={{ padding: '0.55rem' }}>{formatCurrency(row.principal)}</td>
                                <td style={{ padding: '0.55rem', color: '#f87171' }}>{formatCurrency(row.interest)}</td>
                                <td style={{ padding: '0.55rem', color: 'var(--accent, #10b981)', fontWeight: row.extraPrincipal > 0 ? 600 : 400 }}>
                                    {row.extraPrincipal > 0 ? `+${formatCurrency(row.extraPrincipal)}` : '-'}
                                </td>
                                {hasInsurance && <td style={{ padding: '0.55rem', color: '#60a5fa' }}>{formatCurrency(row.insurance)}</td>}
                                {hasSavings && <td style={{ padding: '0.55rem', color: '#34d399' }}>{formatCurrency(row.savings)}</td>}
                                {hasCharges && <td style={{ padding: '0.55rem', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(row.totalWithCharges)}</td>}
                                <td style={{ padding: '0.55rem' }}>{formatCurrency(row.totalPrincipal)}</td>
                                <td style={{ padding: '0.55rem', fontWeight: 700 }}>{formatCurrency(row.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Save as Loan Modal */}
            <Modal
                open={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                title="Guardar Simulación como Préstamo del Sistema"
                size="md"
            >
                <form onSubmit={handleSaveLoan} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '0.85rem', borderRadius: 'var(--border-radius)', fontSize: '0.875rem' }}>
                        Se registrará un préstamo por <strong>{formatCurrency(effectivePrincipal)}</strong> al <strong>{annualRate}% anual</strong> en <strong>{termMonths} meses</strong> con cuota base de <strong>{formatCurrency(result.summary.regularPayment)}</strong>.
                        {hasCommission && (
                            <div style={{ marginTop: '0.35rem', color: '#f59e0b', fontWeight: 500 }}>
                                Comisión por desembolso: <strong>{formatCurrency(result.summary.disbursementCommission)}</strong> ({commissionType === 'percent' ? `${commissionValue}%` : 'Monto fijo'}) • Líquido a recibir: <strong>{formatCurrency(result.summary.netDisbursedAmount)}</strong>.
                            </div>
                        )}
                        {(hasInsurance || hasSavings) && (
                            <div style={{ marginTop: '0.35rem', color: 'var(--primary)', fontWeight: 500 }}>
                                Incluye {hasInsurance ? `Seguro (${formatCurrency(result.summary.firstPeriodInsurance)})` : ''} {hasInsurance && hasSavings ? ' y ' : ''} {hasSavings ? `Ahorro (${formatCurrency(result.summary.firstPeriodSavings)})` : ''}. Cuota total estimada: <strong>{formatCurrency(result.summary.firstPeriodTotalPayment)}</strong>.
                            </div>
                        )}
                    </div>

                    <div className="form-grid form-grid-2">
                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Empresa Titular *</label>
                            <select
                                required
                                value={saveForm.empresa_id}
                                onChange={e => setSaveForm({ ...saveForm, empresa_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">Seleccione una empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre} ({emp.codigo})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Banco Acreedor</label>
                            <select
                                value={saveForm.banco_id}
                                onChange={e => setSaveForm({ ...saveForm, banco_id: e.target.value })}
                                style={{ width: '100%', height: '42px' }}
                            >
                                <option value="">(Opcional) Seleccione banco...</option>
                                {bancos.map(b => (
                                    <option key={b.id} value={b.id}>{b.descripcion}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Número / Referencia del Préstamo *</label>
                            <input
                                required
                                type="text"
                                value={saveForm.numero_prestamo}
                                onChange={e => setSaveForm({ ...saveForm, numero_prestamo: e.target.value.toUpperCase() })}
                                style={{ width: '100%', height: '42px', textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Descripción / Destino del Crédito *</label>
                            <input
                                required
                                type="text"
                                value={saveForm.descripcion}
                                onChange={e => setSaveForm({ ...saveForm, descripcion: e.target.value.toUpperCase() })}
                                style={{ width: '100%', height: '42px', textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className="span-2">
                            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Notas u Observaciones</label>
                            <textarea
                                rows={2}
                                value={saveForm.notas}
                                onChange={e => setSaveForm({ ...saveForm, notas: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'transparent' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => setShowSaveModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button type="submit" disabled={savingLoan} className="btn-primary" style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle2 size={18} /> {savingLoan ? 'Guardando...' : 'Confirmar y Guardar'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
