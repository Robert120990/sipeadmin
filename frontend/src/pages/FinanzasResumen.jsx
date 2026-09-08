import React, { useState, useEffect } from 'react';
import { BarChart3, Landmark, DollarSign, Calendar, TrendingDown, Clock, AlertTriangle, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';
import api from '../services/api';
import { formatCurrency } from '../utils/loanCalculations';

export default function FinanzasResumen() {
    const { addToast } = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchResumen = async () => {
        setLoading(true);
        try {
            const res = await api.get('/finanzas/resumen');
            setData(res.data);
        } catch (error) {
            addToast('Error al cargar resumen financiero', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchResumen();
    }, []);

    // Export to Excel
    const exportToExcel = () => {
        if (!data) return;
        const wsData = (data.prestamos_activos || []).map(p => ({
            'Préstamo': p.numero_prestamo,
            'Descripción': p.descripcion,
            'Empresa': p.empresa_nombre,
            'Banco': p.banco_nombre || 'N/A',
            'Cuota Periódica': p.cuota_calculada,
            'Saldo Actual': p.saldo_actual,
            'Monto Original': p.monto_original,
            'Último Pago': p.ultimo_pago ? p.ultimo_pago.split('T')[0] : 'Sin pagos'
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumen_Deuda");
        XLSX.writeFile(wb, `Resumen_Finanzas_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Export to PDF
    const exportToPDF = () => {
        if (!data) return;
        const doc = new jsPDF();
        doc.setFontSize(15);
        doc.text('Resumen de Deuda y Compromisos Financieros', 14, 15);
        doc.setFontSize(9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} | Saldo Deudor Total: ${formatCurrency(data.kpi?.saldo_total_pendiente || 0)}`, 14, 22);

        const columns = ['Préstamo', 'Empresa', 'Banco', 'Cuota', 'Saldo Pendiente'];
        const rows = (data.prestamos_activos || []).map(p => [
            p.numero_prestamo,
            p.empresa_nombre,
            p.banco_nombre || 'N/A',
            formatCurrency(p.cuota_calculada),
            formatCurrency(p.saldo_actual)
        ]);

        autoTable(doc, {
            head: [columns],
            body: rows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }
        });

        doc.save(`Resumen_Finanzas_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    if (loading) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Cargando resumen financiero...
            </div>
        );
    }

    const kpi = data?.kpi || {};
    const porEmpresa = data?.por_empresa || [];
    const porBanco = data?.por_banco || [];
    const prestamosActivos = data?.prestamos_activos || [];

    const totalSaldoEmpresas = porEmpresa.reduce((a, b) => a + (b.saldo_deudor || 0), 0) || 1;
    const totalSaldoBancos = porBanco.reduce((a, b) => a + (b.saldo_deudor || 0), 0) || 1;

    return (
        <div>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BarChart3 size={28} color="var(--primary)" /> Resumen y Vencimientos Financieros
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Monitoreo consolidado de pasivos financieros, servicio mensual de deuda y distribución de créditos por empresa y banco acreedor.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={exportToExcel} disabled={prestamosActivos.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} disabled={prestamosActivos.length === 0} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Deuda Vigente</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>{formatCurrency(kpi.saldo_total_pendiente)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        De {formatCurrency(kpi.total_monto_contratado)} contratados
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent, #10b981)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Capital Ya Amortizado</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent, #10b981)' }}>{formatCurrency(kpi.total_capital_amortizado)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {kpi.total_monto_contratado > 0 ? `${((kpi.total_capital_amortizado / kpi.total_monto_contratado) * 100).toFixed(1)}% del total` : '0%'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Flujo de Cuotas Mensual</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{formatCurrency(kpi.cuota_mensual_total)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Compromiso corriente de pago
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Estado de Préstamos</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                        {kpi.prestamos_activos || 0} Activos / {kpi.prestamos_pagados || 0} Pagados
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {kpi.total_prestamos || 0} registrados en total
                    </div>
                </div>
            </div>

            {/* Middle Grid: Debt by Company & Debt by Bank */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* By Company */}
                <div className="card glass" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Landmark size={20} color="var(--primary)" /> Distribución de Deuda por Empresa
                    </h3>

                    {porEmpresa.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay deuda activa registrada por empresa.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {porEmpresa.map(emp => {
                                const pct = Math.round((emp.saldo_deudor / totalSaldoEmpresas) * 100);
                                return (
                                    <div key={emp.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 600 }}>{emp.empresa_nombre} ({emp.empresa_codigo})</span>
                                            <span style={{ fontWeight: 700, color: '#f87171' }}>{formatCurrency(emp.saldo_deudor)} ({pct}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }}></div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            <span>{emp.cantidad_prestamos} préstamo(s)</span>
                                            <span>Contratado: {formatCurrency(emp.monto_original)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* By Bank */}
                <div className="card glass" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <DollarSign size={20} color="var(--accent, #10b981)" /> Exposición Crediticia por Banco Acreedor
                    </h3>

                    {porBanco.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay deuda activa registrada por banco.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {porBanco.map((b, idx) => {
                                const pct = Math.round((b.saldo_deudor / totalSaldoBancos) * 100);
                                return (
                                    <div key={idx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 600 }}>{b.banco_nombre}</span>
                                            <span style={{ fontWeight: 700, color: '#f87171' }}>{formatCurrency(b.saldo_deudor)} ({pct}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: '#10b981', borderRadius: '4px' }}></div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            <span>{b.cantidad_prestamos} crédito(s)</span>
                                            <span>Contratado: {formatCurrency(b.monto_original)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Active Loans & Commitments */}
            <div className="card glass table-responsive" style={{ padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem' }}>
                    Detalle de Compromisos Crediticios Activos
                </h3>

                <table style={{ minWidth: '950px', width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.65rem' }}>N° Préstamo</th>
                            <th style={{ padding: '0.65rem' }}>Descripción</th>
                            <th style={{ padding: '0.65rem' }}>Empresa</th>
                            <th style={{ padding: '0.65rem' }}>Banco</th>
                            <th style={{ padding: '0.65rem' }}>Cuota Periódica</th>
                            <th style={{ padding: '0.65rem' }}>Saldo Restante</th>
                            <th style={{ padding: '0.65rem' }}>Último Pago Registrado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {prestamosActivos.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No hay préstamos activos registrados.
                                </td>
                            </tr>
                        ) : (
                            prestamosActivos.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>{p.numero_prestamo}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.descripcion}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.empresa_nombre}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.banco_nombre || 'Sin banco'}</td>
                                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{formatCurrency(p.cuota_calculada)}</td>
                                    <td style={{ padding: '0.6rem', fontWeight: 700, color: '#f87171' }}>{formatCurrency(p.saldo_actual)}</td>
                                    <td style={{ padding: '0.6rem' }}>{p.ultimo_pago ? (p.ultimo_pago).split('T')[0] : 'Sin pagos aún'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
