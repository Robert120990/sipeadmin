import React, { useState, useMemo } from 'react';
import { Calculator, DollarSign, Calendar, Percent, TrendingDown, ArrowRight, FileSpreadsheet, FileText, Plus, Trash2, CheckCircle2, Landmark, RefreshCw, ShieldCheck, PiggyBank } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import api from '../services/api';
import { calculatePMT, calculatePV, generateAmortizationSchedule, formatCurrency, FREQUENCIES, INSURANCE_TYPES, SAVINGS_TYPES } from '../utils/loanCalculations';

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

    // Additional Charges: Seguro & Ahorro Obligatorio
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

    const hasInsurance = insuranceType !== 'none' && parseFloat(insuranceValue) > 0;
    const hasSavings = savingsType !== 'none' && parseFloat(savingsValue) > 0;
    const hasCharges = hasInsurance || hasSavings;

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
            savingsValue
        });
    }, [effectivePrincipal, annualRate, termMonths, frequency, startDate, extraMonthly, customExtras, insuranceType, insuranceValue, savingsType, savingsValue]);

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
                empresa_id: data.empresas[0]?.id || '',
                banco_id: data.bancos[0]?.id || '',
                numero_prestamo: `PREST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
            }));
            setShowSaveModal(true);
        } catch (error) {
            addToast('Error al cargar catálogos para registrar préstamo', 'error');
        }
    };

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        if (!saveForm.empresa_id || !saveForm.numero_prestamo || !saveForm.descripcion) {
            return addToast('Complete los campos requeridos', 'warning');
        }
        setSavingLoan(true);
        try {
            await api.post('/finanzas/prestamos', {
                empresa_id: saveForm.empresa_id,
                banco_id: saveForm.banco_id || null,
                numero_prestamo: saveForm.numero_prestamo,
                descripcion: saveForm.descripcion,
                monto_original: effectivePrincipal,
                tasa_interes_anual: annualRate,
                plazo_meses: termMonths,
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
                notas: saveForm.notas
            });
            addToast('¡Préstamo registrado exitosamente en el sistema!', 'success');
            setShowSaveModal(false);
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al guardar préstamo', 'error');
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
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Amortizacion");
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
        if (hasCharges) {
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

                        {/* Additional Charges: Seguro & Ahorro Obligatorio */}
                        <div style={{
                            gridColumn: '1 / -1',
                            borderTop: '1px solid var(--border)',
                            paddingTop: '1.25rem',
                            marginTop: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.925rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <ShieldCheck size={18} color="var(--primary)" /> Seguro y Ahorro Obligatorio (Opcional)
                                </span>
                                {hasCharges && (
                                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.15)', color: 'var(--primary)', fontWeight: 600 }}>
                                        + Cargos Activos
                                    </span>
                                )}
                            </div>

                            <div className="form-grid form-grid-2">
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

                {hasCharges && (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Percent size={18} color="var(--primary)" /> Curva de Amortización del Saldo Deudor
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#94a3b8', borderRadius: '2px' }}></span> Plan Regular
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#10b981', borderRadius: '2px' }}></span> Con Abonos Extra
                        </span>
                    </div>
                </div>

                <div style={{ width: '100%', height: '180px', position: 'relative' }}>
                    <svg viewBox="0 0 800 160" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        {/* Grid lines */}
                        <line x1="0" y1="150" x2="800" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                        <line x1="0" y1="75" x2="800" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="0" y1="10" x2="800" y2="10" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />

                        {/* Original line */}
                        {origPoints.length > 1 && (
                            <path
                                d={origPoints.reduce((acc, pt, idx) => {
                                    const x = (idx / (origPoints.length - 1)) * 800;
                                    const y = 150 - ((pt.balance / maxBalance) * 140);
                                    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                            />
                        )}

                        {/* Accelerated line */}
                        {schedulePoints.length > 1 && (
                            <path
                                d={schedulePoints.reduce((acc, pt, idx) => {
                                    const x = (idx / (origPoints.length - 1)) * 800;
                                    const y = 150 - ((pt.balance / maxBalance) * 140);
                                    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                                }, '')}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                            />
                        )}
                    </svg>
                </div>
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
                        {hasCharges && (
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
