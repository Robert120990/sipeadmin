import React, { useState, useEffect } from 'react';
import {
    TrendingUp, Fuel, RefreshCw, FileText, Sun, Truck, Gauge, Target
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY, todayStr, offsetDaysStr } from '../utils/date';
import EstrategiaNav from '../components/EstrategiaNav';
import ReportPreviewModal from '../components/ReportPreviewModal';

export default function EstrategiaRentabilidad() {
    const { addToast } = useToast();

    const getDefaultDates = () => ({
        desde: offsetDaysStr(-30),
        hasta: todayStr()
    });

    const [{ desde, hasta }, setDates] = useState(getDefaultDates);
    const [pnlData, setPnlData] = useState(null);
    const [elasticidadData, setElasticidadData] = useState(null);
    const [filtroPosicion, setFiltroPosicion] = useState('todas');
    const [loading, setLoading] = useState(true);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [dossierPreview, setDossierPreview] = useState({ open: false, blob: null });

    const fetchRentabilidad = async () => {
        setLoading(true);
        try {
            const d1 = new Date(desde);
            const d2 = new Date(hasta);
            const diasVentana = Math.max(14, Math.min(90, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1 || 30));

            const [pnlRes, elastRes] = await Promise.allSettled([
                api.get(`/inteligencia/rentabilidad-estaciones?desde=${desde}&hasta=${hasta}`),
                api.get(`/inteligencia/elasticidad-precios?dias=${diasVentana}`)
            ]);

            if (pnlRes.status === 'fulfilled') {
                setPnlData(pnlRes.value.data);
            } else {
                addToast('Error al calcular el P&L y rentabilidad por estación', 'error');
            }

            if (elastRes.status === 'fulfilled') {
                setElasticidadData(elastRes.value.data);
            }
        } catch (error) {
            console.error('Error fetching rentabilidad:', error);
            addToast('Error al cargar indicadores de rentabilidad', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDossierPdf = async () => {
        setPdfLoading(true);
        try {
            const res = await api.get('/inteligencia/dossier-ejecutivo-pdf', { responseType: 'blob' });
            const pdfBlob = new Blob([res.data], { type: 'application/pdf' });
            setDossierPreview({ open: true, blob: pdfBlob });
        } catch (error) {
            console.error('Error generando Dossier PDF:', error);
            addToast('No se pudo generar el Dossier Ejecutivo Semanal PDF', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    useEffect(() => {
        fetchRentabilidad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumen = pnlData?.resumen_consolidado || {};
    const estaciones = pnlData?.estaciones || [];
    const esFuenteReal = resumen.fuente_costos === 'real_integrado';

    const elasticidadItems = elasticidadData?.elasticidad || [];
    const elasticidadResumen = elasticidadData?.resumen || {};
    const elasticidadFiltrada = elasticidadItems.filter((item) => {
        if (filtroPosicion === 'todas') return true;
        return item.posicion === filtroPosicion;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            <EstrategiaNav />

            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <TrendingUp size={22} color="#8b5cf6" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Rentabilidad Real (EBITDA) & Elasticidad DGEHM</h1>
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                backgroundColor: esFuenteReal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                color: esFuenteReal ? '#10b981' : 'var(--text-muted)'
                            }}>
                                {esFuenteReal ? 'COSTOS REALES INTEGRADOS' : 'MODELO ESTÁNDAR'}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Factura mayorista Puma, flete por cisterna, planilla RRHH, ahorro solar y elasticidad zonal • {formatDateDMY(desde)} al {formatDateDMY(hasta)}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                        type="date"
                        className="form-control"
                        value={desde}
                        onChange={(e) => setDates(prev => ({ ...prev, desde: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '132px' }}
                    />
                    <input
                        type="date"
                        className="form-control"
                        value={hasta}
                        onChange={(e) => setDates(prev => ({ ...prev, hasta: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '132px' }}
                    />
                    <button
                        onClick={fetchRentabilidad}
                        className="btn btn-primary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Calcular P&L
                    </button>
                    <button
                        onClick={handleOpenDossierPdf}
                        disabled={pdfLoading}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.95rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileText size={15} /> {pdfLoading ? 'Generando...' : 'Dossier Semanal PDF'}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
                gap: '0.85rem'
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Volumen Despachado
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        {resumen.galones_totales?.toLocaleString() || 0} gal
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <Truck size={13} /> Flete cisternas: ${resumen.flete_total_usd?.toLocaleString() || 0}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Margen Bruto Total
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.2rem' }}>
                        ${resumen.margen_bruto_total?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Combustible neto flete + Tiendas + Lubricantes
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: (resumen.utilidad_operativa_total || 0) >= 0 ? '4px solid #10b981' : '4px solid #ef4444' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        EBITDA Operativo Neto
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: (resumen.utilidad_operativa_total || 0) >= 0 ? '#10b981' : '#ef4444', marginTop: '0.2rem' }}>
                        ${resumen.utilidad_operativa_total?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <Sun size={13} /> Escudo Solar: +${resumen.ahorro_solar_total_usd?.toLocaleString() || 0} en OPEX
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Retorno Neto & Elasticidad
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.2rem' }}>
                        ${resumen.margen_neto_promedio_galon || 0} /gal
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {elasticidadResumen.oportunidades_captura_margen || 0} oport. margen • {elasticidadResumen.alertas_fuga_volumen || 0} alertas fuga
                    </div>
                </div>
            </div>

            {/* Tabla P&L por Estación */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Fuel size={18} color="var(--primary)" /> Estado de Resultados Operativo y Punto de Equilibrio por Estación
                    </h3>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {resumen.estaciones_estrella || 0} estrella • {resumen.estaciones_en_perdida || 0} en déficit
                    </span>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>GALONES</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>MARGEN COMB. ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>TIENDA / LUB. ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>MARGEN BRUTO ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>GASTOS OPEX REAL ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>EBITDA NETO ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>NETO/GAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>PTO. EQUILIBRIO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>CATEGORÍA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Calculando P&L operativo integrado...
                                    </td>
                                </tr>
                            ) : estaciones.length === 0 ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No se encontraron registros de ventas en este período.
                                    </td>
                                </tr>
                            ) : (
                                estaciones.map((e, idx) => {
                                    const esEstrella = e.clasificacion === 'estrella';
                                    const esPerdida = e.clasificacion === 'en_perdida';
                                    const dc = e.desglose_costos_reales || {};
                                    const tiendaMasLub = (e.margenes_brutos?.tienda || 0) + (e.margenes_brutos?.lubricantes || 0);

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'RENTABLE';
                                    if (esEstrella) {
                                        badgeColor = '#8b5cf6';
                                        badgeBg = 'rgba(139, 92, 246, 0.15)';
                                        badgeText = 'ESTRELLA';
                                    } else if (esPerdida) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'EN PÉRDIDA';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                <div>{e.estacion}</div>
                                                {dc.flete_total_usd > 0 && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                                        Flete: ${dc.flete_total_usd.toLocaleString()} (${Number(dc.flete_galon_usd || 0).toFixed(4)}/gal)
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                {e.galones_vendidos?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                ${e.margenes_brutos?.combustible?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                ${tiendaMasLub.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>
                                                ${e.margenes_brutos?.total?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                <div style={{ color: '#ef4444', fontWeight: 600 }}>
                                                    -${e.gastos_operativos?.total?.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    Planilla ${dc.planilla_rrhh_usd?.toLocaleString() || 0}
                                                    {dc.ahorro_solar_usd > 0 ? ` • ☀️ -$${dc.ahorro_solar_usd.toLocaleString()}` : ''}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: e.utilidad_operativa_neta >= 0 ? '#10b981' : '#ef4444' }}>
                                                ${e.utilidad_operativa_neta?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                ${e.margen_neto_por_galon}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                {e.punto_equilibrio_galones?.toLocaleString()} gal
                                                <span style={{ display: 'block', fontSize: '0.72rem', color: e.superavit_punto_equilibrio >= 0 ? '#10b981' : '#ef4444' }}>
                                                    {e.superavit_punto_equilibrio >= 0 ? `+${e.superavit_punto_equilibrio?.toLocaleString()} superávit` : `${e.superavit_punto_equilibrio?.toLocaleString()} déficit`}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    backgroundColor: badgeBg,
                                                    color: badgeColor,
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 'bold',
                                                    display: 'inline-block'
                                                }}>
                                                    {badgeText}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tabla de Elasticidad de Precios DGEHM vs Volumen Despachado */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Target size={18} color="#f59e0b" /> Elasticidad de Precios Zonal (DGEHM) vs. Volumen Despachado (7d vs Base)
                        </h3>
                        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                            Cruza el diferencial en centavos contra competidores de la zona y la respuesta real en galones diarios despachados.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select
                            value={filtroPosicion}
                            onChange={(e) => setFiltroPosicion(e.target.value)}
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                        >
                            <option value="todas">Todas las Posiciones ({elasticidadItems.length})</option>
                            <option value="fuga_volumen">Alertas Fuga de Volumen ({elasticidadResumen.alertas_fuga_volumen || 0})</option>
                            <option value="oportunidad_margen">Oportunidad de Margen ({elasticidadResumen.oportunidades_captura_margen || 0})</option>
                            <option value="poder_marca">Poder de Marca</option>
                        </select>
                    </div>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '940px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN SIPE</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>PRODUCTO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>PRECIO SIPE</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>PROM. ZONA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>MÍNIMO COMPETIDOR</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>DIFERENCIAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>VOLUMEN (7D)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>POSICIÓN</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ACCIÓN SUGERIDA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Analizando elasticidad de precios frente a competencia DGEHM...
                                    </td>
                                </tr>
                            ) : elasticidadFiltrada.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Sin registros de competencia zonal para el filtro seleccionado.
                                    </td>
                                </tr>
                            ) : (
                                elasticidadFiltrada.map((el, i) => {
                                    let posLabel = 'ALINEADO';
                                    let posBg = 'rgba(100, 116, 139, 0.15)';
                                    let posColor = 'var(--text-muted)';
                                    if (el.posicion === 'fuga_volumen') {
                                        posLabel = 'FUGA VOLUMEN';
                                        posBg = 'rgba(239, 68, 68, 0.15)';
                                        posColor = '#ef4444';
                                    } else if (el.posicion === 'oportunidad_margen') {
                                        posLabel = 'OPORTUNIDAD MARGEN';
                                        posBg = 'rgba(16, 185, 129, 0.15)';
                                        posColor = '#10b981';
                                    } else if (el.posicion === 'poder_marca') {
                                        posLabel = 'PODER MARCA';
                                        posBg = 'rgba(139, 92, 246, 0.15)';
                                        posColor = '#8b5cf6';
                                    }

                                    const gapSign = el.diferencial_centavos > 0 ? '+' : '';
                                    const volSign = el.variacion_volumen_pct > 0 ? '+' : '';

                                    return (
                                        <tr key={`${el.id_estacion}_${el.combustible_key}_${i}`} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{el.estacion}</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>{el.combustible}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                                ${Number(el.precio_sipe_usd || 0).toFixed(2)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                ${Number(el.precio_promedio_zona_usd || 0).toFixed(2)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <span style={{ fontWeight: 600 }}>${Number(el.precio_min_competidor_usd || 0).toFixed(2)}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                                                    ({el.competidor_mas_barato})
                                                </span>
                                            </td>
                                            <td style={{
                                                padding: '0.45rem 0.5rem',
                                                textAlign: 'center',
                                                fontWeight: 700,
                                                color: el.diferencial_centavos > 1.5 ? '#ef4444' : el.diferencial_centavos < -1.5 ? '#10b981' : 'var(--text)'
                                            }}>
                                                {gapSign}{el.diferencial_centavos}¢
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: el.variacion_volumen_pct < -3 ? '#ef4444' : el.variacion_volumen_pct > 2 ? '#10b981' : 'var(--text)'
                                                }}>
                                                    {volSign}{el.variacion_volumen_pct}%
                                                </span>
                                                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    {el.galones_diarios_7d?.toLocaleString() || 0} gal/d
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    backgroundColor: posBg,
                                                    color: posColor,
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    display: 'inline-block',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {posLabel}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '290px' }}>
                                                {el.recomendacion}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ReportPreviewModal
                isOpen={dossierPreview.open}
                onClose={() => setDossierPreview({ open: false, blob: null })}
                title="Dossier Ejecutivo Semanal — Grupo SIPE"
                subtitle={`Rentabilidad EBITDA Real, Tesorería, Tanques y Auditoría • ${formatDateDMY(desde)} al ${formatDateDMY(hasta)}`}
                badge="CARTA OFICIAL"
                icon={Gauge}
                pdfSource={dossierPreview.blob}
                fileName={`Dossier_Ejecutivo_SIPE_${hasta}.pdf`}
                totalPages={1}
                footerInfo="Documento Ejecutivo Confidencial — Formato Carta Estándar (215.9mm x 279.4mm)"
            />
        </div>
    );
}
