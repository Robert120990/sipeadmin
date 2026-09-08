import React, { useState, useEffect, useMemo } from 'react';
import { 
    TrendingUp, Plus, DollarSign, Calendar, RefreshCw, 
    Save, FileSpreadsheet, FileText, Trash2, CheckCircle2, 
    XCircle, AlertCircle, ArrowUpRight, ArrowDownRight, Layers, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { formatCurrency } from '../utils/loanCalculations';
import { 
    calculateNPV, calculateIRR, calculatePayback, 
    calculateDiscountedPayback, calculateROI, calculateBCRatio, 
    generateSensitivityScenarios 
} from '../utils/investmentCalculations';

export default function FinanzasInversiones() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [activeTab, setActiveTab] = useState('simulador'); // 'simulador' | 'cartera'
    const [empresas, setEmpresas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Filtros de cartera
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');

    // Estado del Simulador
    const [form, setForm] = useState({
        empresa_id: '',
        nombre_proyecto: 'Adquisición de Cisterna de Combustible 10,000 Gal',
        descripcion: 'Cisterna para abastecimiento directo y reducción de fletes tercerizados.',
        categoria: 'transporte',
        inversion_inicial: 45000,
        tasa_descuento: 10,
        plazo_anios: 5,
        valor_residual: 8000,
        estado: 'evaluacion'
    });

    // Flujos anuales en el simulador
    const [flujos, setFlujos] = useState([14000, 15000, 16000, 16500, 17000]);

    // Hover sobre punto de la gráfica
    const [hoveredPoint, setHoveredPoint] = useState(null);

    // Plantillas rápidas
    const presets = [
        {
            nombre: 'Cisterna Combustible 10,000 Gal',
            categoria: 'transporte',
            inversion: 45000,
            anios: 5,
            residual: 8000,
            tasa: 10,
            flujoBase: 15000,
            crecimiento: 0.05,
            desc: 'Cisterna de acero para optimizar logística de acarreo.'
        },
        {
            nombre: 'Modernización de Dispensadores Electrónicos',
            categoria: 'equipo_estacion',
            inversion: 28000,
            anios: 5,
            residual: 3000,
            tasa: 9.5,
            flujoBase: 9500,
            crecimiento: 0.04,
            desc: 'Dispensadores de 4 mangueras de alta velocidad y menor merma.'
        },
        {
            nombre: 'Sistema Solar Fotovoltaico Estación (40 kW)',
            categoria: 'eficiencia_energetica',
            inversion: 36000,
            anios: 8,
            residual: 4000,
            tasa: 11,
            flujoBase: 8500,
            crecimiento: 0.03,
            desc: 'Ahorro sustancial en factura eléctrica mensual de compresores y luces.'
        },
        {
            nombre: 'Pista de Concreto y Techado de Estación',
            categoria: 'infraestructura',
            inversion: 55000,
            anios: 7,
            residual: 5000,
            tasa: 10.5,
            flujoBase: 16000,
            crecimiento: 0.04,
            desc: 'Renovación de imagen comercial y durabilidad para tráfico pesado.'
        },
        {
            nombre: 'Ampliación Tienda de Conveniencia',
            categoria: 'expansion',
            inversion: 22000,
            anios: 4,
            residual: 2500,
            tasa: 12,
            flujoBase: 9000,
            crecimiento: 0.06,
            desc: 'Aumento de ventas de lubricantes, accesorios y consumo rápido.'
        }
    ];

    // Cargar empresas y proyectos
    const fetchData = async () => {
        setLoading(true);
        try {
            const [empRes, projRes] = await Promise.all([
                api.get('/finanzas/catalogos'),
                api.get('/finanzas/proyectos')
            ]);
            setEmpresas(empRes.data?.empresas || []);
            setProyectos(projRes.data || []);
            if (empRes.data?.empresas?.length > 0 && !form.empresa_id) {
                setForm(prev => ({ ...prev, empresa_id: empRes.data.empresas[0].id }));
            }
        } catch (error) {
            console.error('Error fetching data in inversiones:', error);
            addToast('Error al cargar datos financieros', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sincronizar número de flujos cuando cambia el plazo de años
    const handlePlazoChange = (newYears) => {
        const years = Math.max(1, Math.min(10, parseInt(newYears, 10) || 1));
        setForm(prev => ({ ...prev, plazo_anios: years }));

        setFlujos(prev => {
            const arr = [...prev];
            const lastVal = arr[arr.length - 1] || 10000;
            if (arr.length < years) {
                while (arr.length < years) {
                    arr.push(Math.round(lastVal * 1.03));
                }
            } else if (arr.length > years) {
                arr.length = years;
            }
            return arr;
        });
    };

    // Aplicar Preset
    const applyPreset = (preset) => {
        setForm(prev => ({
            ...prev,
            nombre_proyecto: preset.nombre,
            categoria: preset.categoria,
            inversion_inicial: preset.inversion,
            plazo_anios: preset.anios,
            valor_residual: preset.residual,
            tasa_descuento: preset.tasa,
            descripcion: preset.desc
        }));

        const newFlows = [];
        let curFlow = preset.flujoBase;
        for (let i = 0; i < preset.anios; i++) {
            newFlows.push(Math.round(curFlow));
            curFlow *= (1 + preset.crecimiento);
        }
        setFlujos(newFlows);
        addToast(`Plantilla "${preset.nombre}" aplicada`, 'info');
    };

    // Actualizar un flujo específico
    const handleFlujoChange = (index, value) => {
        const val = parseFloat(value) || 0;
        const next = [...flujos];
        next[index] = val;
        setFlujos(next);
    };

    // Generar flujos constantes o con % de crecimiento
    const generarFlujosAutomaticos = (tipo) => {
        const base = flujos[0] || 10000;
        const next = [];
        for (let i = 0; i < form.plazo_anios; i++) {
            if (tipo === 'constante') {
                next.push(base);
            } else if (tipo === 'crecimiento5') {
                next.push(Math.round(base * Math.pow(1.05, i)));
            } else if (tipo === 'crecimiento8') {
                next.push(Math.round(base * Math.pow(1.08, i)));
            }
        }
        setFlujos(next);
        addToast('Flujos proyectados recalculados', 'success');
    };

    // --- CÁLCULOS MATEMÁTICOS REACTIVOS ---
    const financialMetrics = useMemo(() => {
        const rate = (parseFloat(form.tasa_descuento) || 10) / 100;
        const i0 = parseFloat(form.inversion_inicial) || 0;
        const salvage = parseFloat(form.valor_residual) || 0;

        const npv = calculateNPV(rate, i0, flujos, salvage);
        const irr = calculateIRR(i0, flujos, salvage);
        const payback = calculatePayback(i0, flujos);
        const discountedPayback = calculateDiscountedPayback(rate, i0, flujos);
        const roi = calculateROI(i0, flujos, salvage);
        const bcRatio = calculateBCRatio(rate, i0, flujos, salvage);

        // Curva acumulada para el gráfico
        let acumulado = -i0;
        const timeline = [
            { anio: 0, flujo: -i0, acumulado: -i0, saldo: -i0 }
        ];

        flujos.forEach((cf, idx) => {
            const anio = idx + 1;
            let flow = cf;
            if (anio === flujos.length) flow += salvage;
            acumulado += flow;
            timeline.push({
                anio,
                flujo: flow,
                acumulado: Math.round(acumulado * 100) / 100,
                saldo: acumulado
            });
        });

        // Escenarios de sensibilidad
        const sensitivity = generateSensitivityScenarios({
            inversion_inicial: i0,
            tasa_descuento: form.tasa_descuento,
            flujos,
            valor_residual: salvage
        });

        return {
            npv: Math.round(npv * 100) / 100,
            irr,
            payback,
            discountedPayback,
            roi,
            bcRatio,
            timeline,
            sensitivity,
            esViable: npv > 0 && (irr === null || irr > form.tasa_descuento)
        };
    }, [form.tasa_descuento, form.inversion_inicial, form.valor_residual, flujos]);

    // Guardar proyecto en Base de Datos
    const handleGuardarProyecto = async () => {
        if (!form.empresa_id) {
            addToast('Selecciona una empresa para asociar el proyecto', 'warning');
            return;
        }
        if (!form.nombre_proyecto) {
            addToast('Ingresa un nombre para el proyecto', 'warning');
            return;
        }
        if (!form.inversion_inicial || form.inversion_inicial <= 0) {
            addToast('Ingresa un monto válido para la inversión inicial', 'warning');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                empresa_id: form.empresa_id,
                nombre_proyecto: form.nombre_proyecto,
                descripcion: form.descripcion,
                categoria: form.categoria,
                inversion_inicial: form.inversion_inicial,
                tasa_descuento: form.tasa_descuento,
                plazo_anios: form.plazo_anios,
                valor_residual: form.valor_residual,
                roi_estimado: financialMetrics.roi,
                vpn_estimado: financialMetrics.npv,
                tir_estimada: financialMetrics.irr,
                payback_meses: financialMetrics.payback.totalMeses,
                payback_descontado_meses: financialMetrics.discountedPayback.totalMeses,
                relacion_bc: financialMetrics.bcRatio,
                flujos_json: flujos,
                estado: form.estado
            };

            await api.post('/finanzas/proyectos', payload);
            addToast('Proyecto guardado en la cartera exitosamente', 'success');
            fetchData();
            setActiveTab('cartera');
        } catch (error) {
            console.error('Error saving proyecto:', error);
            addToast(error.response?.data?.message || 'Error al guardar el proyecto', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Cargar proyecto existente en el simulador
    const handleCargarEnSimulador = (p) => {
        setForm({
            empresa_id: p.empresa_id,
            nombre_proyecto: p.nombre_proyecto,
            descripcion: p.descripcion || '',
            categoria: p.categoria || 'general',
            inversion_inicial: p.inversion_inicial,
            tasa_descuento: p.tasa_descuento,
            plazo_anios: p.plazo_anios,
            valor_residual: p.valor_residual,
            estado: p.estado || 'evaluacion'
        });
        if (Array.isArray(p.flujos_json) && p.flujos_json.length > 0) {
            setFlujos(p.flujos_json);
        } else {
            const count = p.plazo_anios || 5;
            const avg = (p.inversion_inicial * 1.3) / count;
            setFlujos(Array(count).fill(Math.round(avg)));
        }
        setActiveTab('simulador');
        addToast(`Proyecto "${p.nombre_proyecto}" cargado en el simulador`, 'info');
    };

    // Eliminar proyecto
    const handleEliminarProyecto = async (p) => {
        const ok = await confirm(`¿Estás seguro de eliminar el proyecto "${p.nombre_proyecto}"?`, { variant: 'danger' });
        if (!ok) return;

        try {
            await api.delete(`/finanzas/proyectos/${p.id}`);
            addToast('Proyecto eliminado', 'success');
            setProyectos(prev => prev.filter(item => item.id !== p.id));
        } catch (error) {
            addToast('Error al eliminar proyecto', 'error');
        }
    };

    // Cambiar estado de proyecto
    const handleCambiarEstado = async (p, nuevoEstado) => {
        try {
            await api.put(`/finanzas/proyectos/${p.id}`, {
                ...p,
                estado: nuevoEstado
            });
            addToast(`Estado cambiado a "${nuevoEstado}"`, 'success');
            setProyectos(prev => prev.map(item => item.id === p.id ? { ...item, estado: nuevoEstado } : item));
        } catch (error) {
            addToast('Error al actualizar estado', 'error');
        }
    };

    // Exportar Cartera a Excel
    const exportToExcel = () => {
        if (proyectos.length === 0) return;
        const wsData = proyectos.map(p => ({
            'ID': p.id,
            'Proyecto': p.nombre_proyecto,
            'Empresa': p.empresa_nombre,
            'Categoría': p.categoria,
            'Inversión Inicial': p.inversion_inicial,
            'Tasa Descuento (%)': p.tasa_descuento,
            'VPN Estimado': p.vpn_estimado,
            'TIR Estimada (%)': p.tir_estimada !== null ? p.tir_estimada : 'N/A',
            'ROI (%)': p.roi_estimado,
            'Payback (Meses)': p.payback_meses,
            'Relación B/C': p.relacion_bc,
            'Estado': p.estado
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Proyectos_Inversion");
        XLSX.writeFile(wb, `Cartera_Inversiones_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Exportar Cartera a PDF
    const exportToPDF = () => {
        if (proyectos.length === 0) return;
        const doc = new jsPDF('landscape');
        doc.setFontSize(15);
        doc.text('Cartera de Proyectos de Inversión y Análisis de Rentabilidad', 14, 15);
        doc.setFontSize(9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} | Total Proyectos: ${proyectos.length}`, 14, 22);

        const columns = ['Proyecto', 'Empresa', 'Categoría', 'Inversión', 'VPN', 'TIR', 'ROI', 'Payback', 'Estado'];
        const rows = proyectos.map(p => [
            p.nombre_proyecto,
            p.empresa_nombre,
            p.categoria,
            formatCurrency(p.inversion_inicial),
            formatCurrency(p.vpn_estimado),
            p.tir_estimada !== null ? `${p.tir_estimada}%` : 'N/A',
            `${p.roi_estimado}%`,
            `${Math.round(p.payback_meses / 12)}a ${Math.round(p.payback_meses % 12)}m`,
            p.estado.toUpperCase()
        ]);

        autoTable(doc, {
            head: [columns],
            body: rows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [30, 41, 59] }
        });

        doc.save(`Cartera_Inversiones_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Archivo PDF descargado', 'success');
    };

    // Proyectos filtrados
    const proyectosFiltrados = proyectos.filter(p => {
        if (filtroEmpresa && String(p.empresa_id) !== String(filtroEmpresa)) return false;
        if (filtroEstado && p.estado !== filtroEstado) return false;
        return true;
    });

    // Cálculos de la gráfica SVG
    const svgWidth = 800;
    const svgHeight = 320;
    const padding = { top: 30, right: 30, bottom: 45, left: 75 };
    const chartW = svgWidth - padding.left - padding.right;
    const chartH = svgHeight - padding.top - padding.bottom;

    const timelineData = financialMetrics.timeline;
    const minSaldo = Math.min(...timelineData.map(d => d.saldo), 0);
    const maxSaldo = Math.max(...timelineData.map(d => d.saldo), 1000);
    const rangeSaldo = (maxSaldo - minSaldo) || 1;

    const getY = (val) => padding.top + chartH - ((val - minSaldo) / rangeSaldo) * chartH;
    const getX = (anio) => padding.left + (anio / form.plazo_anios) * chartW;
    const zeroY = getY(0);

    const points = timelineData.map(d => `${getX(d.anio)},${getY(d.saldo)}`).join(' ');

    return (
        <div style={{ paddingBottom: '3rem' }}>
            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
                        <TrendingUp size={28} className="text-primary" />
                        Evaluador de Inversiones y ROI
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0 0', fontSize: '0.92rem' }}>
                        Evaluación financiera de proyectos de capital: VAN / VPN, TIR (Newton-Raphson), Payback simple y descontado, y escenarios de sensibilidad.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button 
                        className={`btn ${activeTab === 'simulador' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('simulador')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <TrendingUp size={16} /> Simulador y Métricas
                    </button>
                    <button 
                        className={`btn ${activeTab === 'cartera' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('cartera')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Layers size={16} /> Cartera de Proyectos ({proyectos.length})
                    </button>
                </div>
            </div>

            {/* TAB 1: SIMULADOR Y MÉTRICAS */}
            {activeTab === 'simulador' && (
                <div>
                    {/* Presets Bar */}
                    <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <Sparkles size={16} style={{ color: '#f59e0b' }} />
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-color)' }}>
                                Plantillas Rápidas para Operaciones de Estaciones y Transporte:
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                            {presets.map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    className="btn btn-sm btn-outline"
                                    onClick={() => applyPreset(preset)}
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', borderRadius: '20px' }}
                                >
                                    + {preset.nombre}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Formulario de Parámetros del Proyecto */}
                    <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <DollarSign size={20} className="text-primary" />
                            Parámetros del Proyecto de Inversión
                        </h3>

                        <div className="form-grid form-grid-3">
                            <div>
                                <label className="form-label">Empresa Responsable *</label>
                                <select 
                                    className="form-control" 
                                    value={form.empresa_id} 
                                    onChange={e => setForm({ ...form, empresa_id: e.target.value })}
                                >
                                    <option value="">-- Seleccionar Empresa --</option>
                                    {empresas.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="span-2">
                                <label className="form-label">Nombre del Proyecto *</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={form.nombre_proyecto} 
                                    onChange={e => setForm({ ...form, nombre_proyecto: e.target.value })}
                                    placeholder="Ej. Cisterna 10,000 Gal Estación Central"
                                />
                            </div>

                            <div>
                                <label className="form-label">Categoría</label>
                                <select 
                                    className="form-control" 
                                    value={form.categoria} 
                                    onChange={e => setForm({ ...form, categoria: e.target.value })}
                                >
                                    <option value="infraestructura">Infraestructura y Obra Civil</option>
                                    <option value="equipo_estacion">Equipos de Pista (Dispensadores/Bombas)</option>
                                    <option value="transporte">Transporte y Pipas de Combustible</option>
                                    <option value="eficiencia_energetica">Eficiencia Energética (Solar/Iluminación)</option>
                                    <option value="tecnologia">Tecnología y Automatización</option>
                                    <option value="expansion">Expansión Comercial / Tienda</option>
                                    <option value="general">Otro / General</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Inversión Inicial ($) *</label>
                                <input 
                                    type="number" 
                                    className="form-control" 
                                    value={form.inversion_inicial} 
                                    onChange={e => setForm({ ...form, inversion_inicial: parseFloat(e.target.value) || 0 })}
                                    min="1"
                                    step="500"
                                />
                            </div>

                            <div>
                                <label className="form-label">Tasa de Descuento Anual (COK / WACC %) *</label>
                                <input 
                                    type="number" 
                                    className="form-control" 
                                    value={form.tasa_descuento} 
                                    onChange={e => setForm({ ...form, tasa_descuento: parseFloat(e.target.value) || 0 })}
                                    min="1"
                                    max="50"
                                    step="0.5"
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Costo de oportunidad o tasa exigida al proyecto</small>
                            </div>

                            <div>
                                <label className="form-label">Horizonte de Evaluación (Años: 1 - 10)</label>
                                <input 
                                    type="number" 
                                    className="form-control" 
                                    value={form.plazo_anios} 
                                    onChange={e => handlePlazoChange(e.target.value)}
                                    min="1"
                                    max="10"
                                />
                            </div>

                            <div>
                                <label className="form-label">Valor Residual / Rescate al Final ($)</label>
                                <input 
                                    type="number" 
                                    className="form-control" 
                                    value={form.valor_residual} 
                                    onChange={e => setForm({ ...form, valor_residual: parseFloat(e.target.value) || 0 })}
                                    min="0"
                                    step="500"
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Valor de liquidación o venta en el último año</small>
                            </div>

                            <div>
                                <label className="form-label">Estado Inicial</label>
                                <select 
                                    className="form-control" 
                                    value={form.estado} 
                                    onChange={e => setForm({ ...form, estado: e.target.value })}
                                >
                                    <option value="evaluacion">En Evaluación</option>
                                    <option value="aprobado">Aprobado</option>
                                    <option value="en_ejecucion">En Ejecución</option>
                                </select>
                            </div>
                        </div>

                        {/* Editor de Flujos Netos */}
                        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                                        Proyección de Flujos Netos de Efectivo (Ingresos Incrementales - Costos Operativos)
                                    </h4>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Ingresa el flujo neto esperado para cada año del proyecto:
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <button 
                                        type="button" 
                                        className="btn btn-sm btn-outline"
                                        onClick={() => generarFlujosAutomaticos('constante')}
                                    >
                                        Repetir Año 1
                                    </button>
                                    <button 
                                        type="button" 
                                        className="btn btn-sm btn-outline"
                                        onClick={() => generarFlujosAutomaticos('crecimiento5')}
                                    >
                                        +5% Crecimiento Anual
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`, gap: '0.8rem' }}>
                                {flujos.map((cf, idx) => (
                                    <div key={idx} style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                            Año {idx + 1}
                                            {idx === flujos.length - 1 && form.valor_residual > 0 && (
                                                <span style={{ color: '#10b981', display: 'block', fontSize: '0.7rem' }}>
                                                    (+${form.valor_residual.toLocaleString()} residual)
                                                </span>
                                            )}
                                        </div>
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            value={cf}
                                            onChange={e => handleFlujoChange(idx, e.target.value)}
                                            step="500"
                                            style={{ fontWeight: 600 }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Botón Guardar */}
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                className="btn btn-primary"
                                onClick={handleGuardarProyecto}
                                disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.4rem' }}
                            >
                                <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Proyecto en Cartera'}
                            </button>
                        </div>
                    </div>

                    {/* LIVE KPIS DE RENTABILIDAD */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {/* VPN */}
                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: `4px solid ${financialMetrics.npv >= 0 ? '#10b981' : '#ef4444'}` }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Valor Presente Neto (VPN / VAN)
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.4rem 0', color: financialMetrics.npv >= 0 ? '#10b981' : '#ef4444' }}>
                                {formatCurrency(financialMetrics.npv)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: financialMetrics.npv >= 0 ? '#10b981' : '#ef4444' }}>
                                {financialMetrics.npv >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                {financialMetrics.npv >= 0 ? 'Genera valor económico neto' : 'Destruye valor económico'}
                            </div>
                        </div>

                        {/* TIR */}
                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: `4px solid ${financialMetrics.irr !== null && financialMetrics.irr >= form.tasa_descuento ? '#10b981' : '#f59e0b'}` }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Tasa Interna de Retorno (TIR / IRR)
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.4rem 0', color: 'var(--text-color)' }}>
                                {financialMetrics.irr !== null ? `${financialMetrics.irr}%` : 'N/A'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                vs Tasa de Descuento: <strong>{form.tasa_descuento}%</strong>
                                {financialMetrics.irr !== null && (
                                    <span style={{ marginLeft: '0.4rem', color: financialMetrics.irr >= form.tasa_descuento ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                        ({financialMetrics.irr >= form.tasa_descuento ? `+${(financialMetrics.irr - form.tasa_descuento).toFixed(2)}% spread` : `Bajo la meta`})
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Payback Simple */}
                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Periodo de Recuperación (Payback)
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.4rem 0', color: 'var(--text-color)' }}>
                                {financialMetrics.payback.recuperado 
                                    ? `${financialMetrics.payback.anios}a ${financialMetrics.payback.meses}m` 
                                    : 'No recupera'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Payback Descontado: <strong>{financialMetrics.discountedPayback.recuperado ? `${financialMetrics.discountedPayback.anios}a ${financialMetrics.discountedPayback.meses}m` : 'Mayor al plazo'}</strong>
                            </div>
                        </div>

                        {/* ROI y Relación B/C */}
                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                ROI y Relación Beneficio/Costo
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.4rem 0', color: 'var(--text-color)' }}>
                                {financialMetrics.roi}% ROI
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Relación B/C: <strong style={{ color: financialMetrics.bcRatio >= 1 ? '#10b981' : '#ef4444' }}>{financialMetrics.bcRatio}x</strong> (Meta &gt; 1.0)
                            </div>
                        </div>
                    </div>

                    {/* GRÁFICA DE CURVA DE RETORNO Y BREAK-EVEN */}
                    <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                                    Curva de Flujo de Efectivo Acumulado y Punto de Equilibrio (Break-even)
                                </h3>
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                    Muestra la evolución del saldo neto desde el desembolso inicial hasta la recuperación de la inversión.
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ width: 12, height: 12, background: '#3b82f6', borderRadius: '50%' }} /> Flujo Acumulado
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ width: 12, height: 2, background: '#10b981' }} /> Punto de Equilibrio ($0)
                                </span>
                            </div>
                        </div>

                        <div className="table-responsive" style={{ overflowX: 'auto', textAlign: 'center' }}>
                            <svg 
                                viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                                style={{ width: '100%', maxWidth: '850px', height: 'auto', overflow: 'visible' }}
                            >
                                <defs>
                                    <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                                    </linearGradient>
                                </defs>

                                {/* Línea de Break-Even (Saldo = $0) */}
                                <line 
                                    x1={padding.left} 
                                    y1={zeroY} 
                                    x2={svgWidth - padding.right} 
                                    y2={zeroY} 
                                    stroke="#10b981" 
                                    strokeWidth="2" 
                                    strokeDasharray="5,5" 
                                />
                                <text 
                                    x={svgWidth - padding.right + 5} 
                                    y={zeroY + 4} 
                                    fill="#10b981" 
                                    fontSize="10" 
                                    fontWeight="bold"
                                >
                                    $0 Break-even
                                </text>

                                {/* Grid Y */}
                                {[minSaldo, minSaldo / 2, 0, maxSaldo / 2, maxSaldo].map((val, idx) => {
                                    const y = getY(val);
                                    return (
                                        <g key={idx}>
                                            <line 
                                                x1={padding.left} 
                                                y1={y} 
                                                x2={svgWidth - padding.right} 
                                                y2={y} 
                                                stroke="currentColor" 
                                                strokeOpacity="0.08" 
                                            />
                                            <text 
                                                x={padding.left - 8} 
                                                y={y + 4} 
                                                textAnchor="end" 
                                                fontSize="10" 
                                                fill="currentColor" 
                                                opacity="0.6"
                                            >
                                                ${Math.round(val / 1000)}k
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Área bajo la curva */}
                                <polygon 
                                    points={`${getX(0)},${zeroY} ${points} ${getX(form.plazo_anios)},${zeroY}`} 
                                    fill="url(#invGradient)" 
                                />

                                {/* Línea principal de la curva */}
                                <polyline 
                                    fill="none" 
                                    stroke="#3b82f6" 
                                    strokeWidth="3.5" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    points={points} 
                                />

                                {/* Puntos interactivos */}
                                {timelineData.map((d, idx) => {
                                    const cx = getX(d.anio);
                                    const cy = getY(d.saldo);
                                    const isBreak = d.saldo >= 0 && (timelineData[idx - 1]?.saldo < 0);

                                    return (
                                        <g 
                                            key={idx} 
                                            style={{ cursor: 'pointer' }}
                                            onMouseEnter={() => setHoveredPoint(d)}
                                            onMouseLeave={() => setHoveredPoint(null)}
                                        >
                                            <circle 
                                                cx={cx} 
                                                cy={cy} 
                                                r={isBreak ? 7 : 5} 
                                                fill={d.saldo >= 0 ? '#10b981' : '#3b82f6'} 
                                                stroke="#ffffff" 
                                                strokeWidth="2" 
                                            />
                                            <text 
                                                x={cx} 
                                                y={svgHeight - 15} 
                                                textAnchor="middle" 
                                                fontSize="11" 
                                                fill="currentColor" 
                                                opacity="0.8"
                                            >
                                                {d.anio === 0 ? 'Desembolso' : `Año ${d.anio}`}
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Tooltip al pasar el cursor */}
                                {hoveredPoint && (
                                    <g>
                                        <rect 
                                            x={Math.min(getX(hoveredPoint.anio) - 60, svgWidth - 140)} 
                                            y={Math.max(getY(hoveredPoint.saldo) - 45, 10)} 
                                            width="130" 
                                            height="38" 
                                            rx="6" 
                                            fill="#1e293b" 
                                            stroke="#475569" 
                                            strokeWidth="1" 
                                        />
                                        <text 
                                            x={Math.min(getX(hoveredPoint.anio) + 5, svgWidth - 75)} 
                                            y={Math.max(getY(hoveredPoint.saldo) - 28, 27)} 
                                            textAnchor="middle" 
                                            fill="#94a3b8" 
                                            fontSize="9"
                                        >
                                            {hoveredPoint.anio === 0 ? 'Inversión Inicial' : `Año ${hoveredPoint.anio} (Flujo: $${hoveredPoint.flujo.toLocaleString()})`}
                                        </text>
                                        <text 
                                            x={Math.min(getX(hoveredPoint.anio) + 5, svgWidth - 75)} 
                                            y={Math.max(getY(hoveredPoint.saldo) - 14, 41)} 
                                            textAnchor="middle" 
                                            fill="#ffffff" 
                                            fontWeight="bold" 
                                            fontSize="10"
                                        >
                                            Saldo: {formatCurrency(hoveredPoint.saldo)}
                                        </text>
                                    </g>
                                )}
                            </svg>
                        </div>
                    </div>

                    {/* ANÁLISIS DE SENSIBILIDAD (ESCENARIOS) */}
                    <div className="card glass" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                            Análisis de Sensibilidad y Resiliencia (Matriz de Escenarios)
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
                            Simula cómo respondería la rentabilidad si los flujos de caja operativos varían por fluctuaciones en ventas de combustible o costos.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                            {/* Pesimista */}
                            <div style={{ background: 'var(--bg-secondary)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>Escenario Pesimista (-15%)</span>
                                    <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>Estrés</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                                    Flujos disminuyen por menor volumen de galonaje o margen ajustado.
                                </div>
                                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div>VPN: <strong style={{ color: financialMetrics.sensitivity.pesimista.npv >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(financialMetrics.sensitivity.pesimista.npv)}</strong></div>
                                    <div>TIR: <strong>{financialMetrics.sensitivity.pesimista.irr !== null ? `${financialMetrics.sensitivity.pesimista.irr}%` : 'N/A'}</strong></div>
                                    <div>ROI: <strong>{financialMetrics.sensitivity.pesimista.roi}%</strong></div>
                                    <div>Recuperación: <strong>{financialMetrics.sensitivity.pesimista.payback.recuperado ? `${financialMetrics.sensitivity.pesimista.payback.anios}a ${financialMetrics.sensitivity.pesimista.payback.meses}m` : 'No recupera'}</strong></div>
                                </div>
                            </div>

                            {/* Base */}
                            <div style={{ background: 'var(--bg-secondary)', padding: '1.2rem', borderRadius: '10px', border: '2px solid #3b82f6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, color: '#3b82f6' }}>Escenario Base (100%)</span>
                                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>Esperado</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                                    Proyección central calculada con los parámetros actuales.
                                </div>
                                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div>VPN: <strong style={{ color: financialMetrics.npv >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(financialMetrics.npv)}</strong></div>
                                    <div>TIR: <strong>{financialMetrics.irr !== null ? `${financialMetrics.irr}%` : 'N/A'}</strong></div>
                                    <div>ROI: <strong>{financialMetrics.roi}%</strong></div>
                                    <div>Recuperación: <strong>{financialMetrics.payback.recuperado ? `${financialMetrics.payback.anios}a ${financialMetrics.payback.meses}m` : 'No recupera'}</strong></div>
                                </div>
                            </div>

                            {/* Optimista */}
                            <div style={{ background: 'var(--bg-secondary)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>Escenario Optimista (+15%)</span>
                                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>Expansión</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                                    Mayor rotación comercial, contratos corporativos o mejor margen.
                                </div>
                                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div>VPN: <strong style={{ color: '#10b981' }}>{formatCurrency(financialMetrics.sensitivity.optimista.npv)}</strong></div>
                                    <div>TIR: <strong>{financialMetrics.sensitivity.optimista.irr !== null ? `${financialMetrics.sensitivity.optimista.irr}%` : 'N/A'}</strong></div>
                                    <div>ROI: <strong>{financialMetrics.sensitivity.optimista.roi}%</strong></div>
                                    <div>Recuperación: <strong>{financialMetrics.sensitivity.optimista.payback.recuperado ? `${financialMetrics.sensitivity.optimista.payback.anios}a ${financialMetrics.sensitivity.optimista.payback.meses}m` : 'No recupera'}</strong></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: CARTERA DE PROYECTOS GUARDADOS */}
            {activeTab === 'cartera' && (
                <div className="card glass" style={{ padding: '1.5rem' }}>
                    {/* Barra de Filtros y Exportación */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
                        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', flex: 1 }}>
                            <select 
                                className="form-control" 
                                style={{ maxWidth: '220px' }}
                                value={filtroEmpresa}
                                onChange={e => setFiltroEmpresa(e.target.value)}
                            >
                                <option value="">Todas las Empresas</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>

                            <select 
                                className="form-control" 
                                style={{ maxWidth: '180px' }}
                                value={filtroEstado}
                                onChange={e => setFiltroEstado(e.target.value)}
                            >
                                <option value="">Todos los Estados</option>
                                <option value="evaluacion">En Evaluación</option>
                                <option value="aprobado">Aprobados</option>
                                <option value="en_ejecucion">En Ejecución</option>
                                <option value="completado">Completados</option>
                                <option value="rechazado">Rechazados</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                            <button 
                                className="btn btn-outline" 
                                onClick={exportToExcel}
                                disabled={proyectos.length === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                            >
                                <FileSpreadsheet size={16} /> Excel
                            </button>
                            <button 
                                className="btn btn-outline" 
                                onClick={exportToPDF}
                                disabled={proyectos.length === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                            >
                                <FileText size={16} /> PDF
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={() => setActiveTab('simulador')}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                            >
                                <Plus size={16} /> Nuevo Proyecto
                            </button>
                        </div>
                    </div>

                    {/* Tabla de Proyectos */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            Cargando cartera de proyectos...
                        </div>
                    ) : proyectosFiltrados.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No hay proyectos registrados que coincidan con los filtros. Usa el simulador para crear el primero.
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table" style={{ width: '100%', minWidth: '950px' }}>
                                <thead>
                                    <tr>
                                        <th>Proyecto</th>
                                        <th>Empresa</th>
                                        <th>Inversión</th>
                                        <th>VPN</th>
                                        <th>TIR</th>
                                        <th>ROI</th>
                                        <th>Payback</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proyectosFiltrados.map(p => (
                                        <tr key={p.id}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{p.nombre_proyecto}</div>
                                                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                    {p.categoria} | Plazo: {p.plazo_anios} años
                                                </small>
                                            </td>
                                            <td>{p.empresa_nombre}</td>
                                            <td style={{ fontWeight: 600 }}>{formatCurrency(p.inversion_inicial)}</td>
                                            <td style={{ fontWeight: 600, color: p.vpn_estimado >= 0 ? '#10b981' : '#ef4444' }}>
                                                {formatCurrency(p.vpn_estimado)}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                {p.tir_estimada !== null ? `${p.tir_estimada}%` : 'N/A'}
                                            </td>
                                            <td>{p.roi_estimado}%</td>
                                            <td>
                                                {Math.floor(p.payback_meses / 12)}a {Math.round(p.payback_meses % 12)}m
                                            </td>
                                            <td>
                                                <select 
                                                    className="form-control form-control-sm"
                                                    value={p.estado}
                                                    onChange={e => handleCambiarEstado(p, e.target.value)}
                                                    style={{ 
                                                        fontSize: '0.78rem', 
                                                        padding: '0.2rem 0.4rem', 
                                                        fontWeight: 600,
                                                        background: p.estado === 'aprobado' || p.estado === 'en_ejecucion' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                                                        color: p.estado === 'aprobado' || p.estado === 'en_ejecucion' ? '#10b981' : 'inherit'
                                                    }}
                                                >
                                                    <option value="evaluacion">En Evaluación</option>
                                                    <option value="aprobado">Aprobado</option>
                                                    <option value="en_ejecucion">En Ejecución</option>
                                                    <option value="completado">Completado</option>
                                                    <option value="rechazado">Rechazado</option>
                                                </select>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                    <button 
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => handleCargarEnSimulador(p)}
                                                        title="Cargar en Simulador para ajustar flujos"
                                                    >
                                                        <RefreshCw size={14} /> Simular
                                                    </button>
                                                    <button 
                                                        className="btn btn-sm btn-outline text-danger"
                                                        onClick={() => handleEliminarProyecto(p)}
                                                        title="Eliminar proyecto"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
