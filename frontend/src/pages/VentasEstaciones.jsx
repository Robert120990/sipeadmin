import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, FileText } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function VentasEstaciones() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];
    const [fecha, setFecha] = useState(defaultDate);
    
    const [dataTiendas, setDataTiendas] = useState([]);
    const [dataEstaciones, setDataEstaciones] = useState([]);
    const [dataMargenes, setDataMargenes] = useState([]);
    const [dataInventario, setDataInventario] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const { addToast } = useToast();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/ventas/consolidado/${fecha}`);
            setDataTiendas(res.data.tiendas || []);
            setDataEstaciones(res.data.estaciones || []);
            setDataMargenes(res.data.margenes || []);
            setDataInventario(res.data.inventario || []);
            addToast('Datos cargados exitosamente', 'success');
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar datos consolidados', 'error');
        }
        setLoading(false);
    };

    // Load once on mount
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalMontoTiendas = dataTiendas.reduce((acc, curr) => acc + (curr.venta || 0), 0);

    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

    const formatMsDate = (msDateStr) => {
        if (!msDateStr) return '';
        const ms = parseInt(msDateStr.replace(/[^0-9-]/g, ''));
        if (isNaN(ms)) return msDateStr;
        return new Date(ms).toLocaleDateString();
    };

    const Badge = ({ val, inverse = false }) => {
        let bg = 'transparent';
        const num = parseFloat(val.replace(/[$,]/g, ''));
        if (!isNaN(num)) {
            if (num > 0) bg = inverse ? '#ef4444' : '#22c55e';
            else if (num < 0) bg = inverse ? '#22c55e' : '#ef4444';
            else if (num === 0) bg = '#f59e0b';
        }
        return (
            <span style={{ backgroundColor: bg, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {val}
            </span>
        );
    };

    const BadgeSquare = ({ val, color }) => {
        const bgColors = {
            'red': '#ef4444',
            'blue': '#0ea5e9',
            'orange': '#f97316'
        };
        return (
            <span style={{ backgroundColor: bgColors[color] || '#cbd5e1', color: '#fff', padding: '2px 4px', borderRadius: '2px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                {val}
            </span>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', zoom: 0.95 }}>
            {/* Control Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Fecha:</span>
                    <Calendar size={16} color="var(--text-muted)" />
                    <input 
                        type="date" 
                        value={fecha} 
                        onChange={e => setFecha(e.target.value)} 
                        style={{ border: 'none', padding: '0.5rem', fontSize: '0.85rem', background: 'transparent', outline: 'none' }}
                    />
                </div>
                <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem' }}>
                    <Search size={16} /> {loading ? 'Cargando...' : 'Consultar'}
                </button>
            </div>

            {/* Table 1: Tiendas E-Market */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Ventas Tiendas E-Market
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Fecha</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Monto</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Promedio</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Eficiencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataTiendas.map((t, i) => {
                                const eficiencia = t.promedio === 0 ? 'NaN%' : (((t.venta / t.promedio) - 1) * 100).toFixed(2) + '%';
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{formatMsDate(t.fecha)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{t.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                        {t.venta === 0 ? <Badge val={moneyFmt(t.venta)} /> : moneyFmt(t.venta)}
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{moneyFmt(t.promedio)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{eficiencia}</td>
                                </tr>
                            )})}
                            {dataTiendas.length > 0 && (
                                <tr style={{ fontWeight: 'bold', background: 'rgba(0,0,0,0.02)' }}>
                                    <td colSpan="2" style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{moneyFmt(totalMontoTiendas)}</td>
                                    <td></td>
                                    <td></td>
                                </tr>
                            )}
                            {dataTiendas.length === 0 && !loading && (
                                <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 2: Estaciones */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Ventas Estaciones
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>D</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>R</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>S</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>I</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Galonaje</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataEstaciones.map((e, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{e.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.diesel)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.regular)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.super)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.ion)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.galonaje)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{moneyFmt(e.venta)}</td>
                                </tr>
                            ))}
                            {dataEstaciones.length === 0 && !loading && (
                                <tr><td colSpan="7" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 3: Margenes */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Márgenes de Combustible
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>DieselA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>RegularA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>SuperA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>DieselC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>RegularC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>SuperC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Master</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>IonDiesel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataMargenes.map((m, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{m.empresa}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_da || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_ra || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_sa || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_dc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_rc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_sc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_master || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_io || 0).toFixed(2)}`} /></td>
                                </tr>
                            ))}
                            {dataMargenes.length === 0 && !loading && (
                                <tr><td colSpan="9" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 4: Inventario */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Inventario de Combustibles
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Diesel</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>IonDiesel</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Super</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Regular</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.D</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.I</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.S</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.R</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataInventario.map((inv, i) => {
                                const mapColor = (val, thresholds) => {
                                    if(val <= thresholds.red) return 'red';
                                    if(val <= thresholds.orange) return 'orange';
                                    return 'blue';
                                };
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{inv.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.diesel || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.iondiesel || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.super || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.regular || 0)}</td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_diesel || 0).toFixed(1)} color={mapColor(inv.duracion_diesel || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_ion || 0).toFixed(1)} color={mapColor(inv.duracion_ion || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_super || 0).toFixed(1)} color={mapColor(inv.duracion_super || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_regular || 0).toFixed(1)} color={mapColor(inv.duracion_regular || 0, {red: 1.5, orange: 3})} /></td>
                                </tr>
                            )})}
                            {dataInventario.length === 0 && !loading && (
                                <tr><td colSpan="9" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
