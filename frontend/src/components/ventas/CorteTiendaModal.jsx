import React, { useState, useEffect } from 'react';
import { 
    Store, FileSpreadsheet, AlertTriangle, AlertCircle, 
    Layers, Receipt, RefreshCw, Search 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../Modal';

const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

export default function CorteTiendaModal({ corteModal, onClose }) {
    const [activeTab, setActiveTab] = useState('lineas');
    const [filterTipo, setFilterTipo] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setActiveTab('lineas');
        setFilterTipo('ALL');
        setSearchTerm('');
    }, [corteModal]);

    if (!corteModal) return null;

    const exportToExcel = () => {
        if (!corteModal) return;
        const wb = XLSX.utils.book_new();
        const rowsCab = [
            [`CORTE DE TIENDA: ${corteModal.empresa}`],
            ['Fecha:', corteModal.fecha],
            ['Turno:', corteModal.cabecera?.turno || '0'],
            ['Responsable:', corteModal.cabecera?.responsable || '-'],
            [''],
            ['Venta', 'Ingresos', 'Tarjeta', 'Remesado', 'Gastos', 'Retiros', 'Saldo Final', 'Diferencia'],
            [
                corteModal.cabecera?.venta || 0,
                corteModal.cabecera?.ingresos || 0,
                corteModal.cabecera?.tarjeta || 0,
                corteModal.cabecera?.remesado || 0,
                corteModal.cabecera?.gastos || 0,
                corteModal.cabecera?.retiros || 0,
                corteModal.cabecera?.saldo_f || 0,
                corteModal.cabecera?.dif || 0
            ],
            [''],
            ['--- VENTAS POR LÍNEA ---'],
            ['Línea de Producto', 'Monto ($)', '% Participación']
        ];
        (corteModal.ventas_lineas || []).forEach(v => {
            rowsCab.push([v.linea, v.monto, `${v.porcentaje}%`]);
        });

        rowsCab.push(['']);
        rowsCab.push(['--- DETALLE DE MOVIMIENTOS ---']);
        rowsCab.push(['Tipo', 'Descripción / Concepto', 'Monto ($)']);
        (corteModal.detalles_movimientos || []).forEach(d => {
            rowsCab.push([d.tipo_nombre || d.tipo, d.descripcion, d.monto]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rowsCab);
        XLSX.utils.book_append_sheet(wb, ws, 'Corte');
        XLSX.writeFile(wb, `Corte_${corteModal.empresa.replace(/\s+/g, '_')}_${corteModal.fecha}.xlsx`);
    };

    const q = (searchTerm || '').toLowerCase().trim();
    const fTipo = String(filterTipo || 'ALL').toUpperCase().trim();
    const movimientosFiltrados = (corteModal.detalles_movimientos || []).filter(item => {
        const itemTipo = String(item.tipo || '').toUpperCase().trim();
        const isObservado = itemTipo === 'G' || Boolean(item.es_generico) || Boolean(item.alerta);
        if (fTipo === 'ALERTS' && !isObservado) return false;
        if (fTipo !== 'ALL' && fTipo !== 'ALERTS' && itemTipo !== fTipo) return false;
        if (q) {
            const desc = String(item.descripcion || '').toLowerCase();
            const tNom = String(item.tipo_nombre || '').toLowerCase();
            if (!desc.includes(q) && !tNom.includes(q)) return false;
        }
        return true;
    });

    return (
        <Modal
            isOpen={Boolean(corteModal)}
            onClose={onClose}
            title={`Corte de Tienda - ${corteModal.empresa}`}
            size="xl"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Header info badge & actions */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    background: 'var(--bg-card)',
                    borderRadius: '6px',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Store size={16} color="var(--primary)" />
                            <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>{corteModal.empresa}</strong>
                            {String(corteModal.id_corte || '').startsWith('SAAS_') && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', fontWeight: 600 }}>SaaS sys.sipesv.com</span>
                            )}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Fecha: <strong style={{ color: 'var(--text)' }}>{corteModal.fecha}</strong>
                        </span>
                        {corteModal.cabecera?.turno && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Turno: <strong style={{ color: 'var(--text)' }}>{corteModal.cabecera.turno}</strong>
                            </span>
                        )}
                        {corteModal.cabecera?.responsable && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Responsable: <strong style={{ color: 'var(--text)' }}>{corteModal.cabecera.responsable}</strong>
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={exportToExcel}
                        className="btn btn-secondary"
                        style={{ height: '30px', padding: '0 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}
                        title="Exportar Corte a Excel"
                    >
                        <FileSpreadsheet size={15} color="#10B981" />
                        <span>Exportar Excel</span>
                    </button>
                </div>

                {/* Incongruencias y Observaciones de Auditoría */}
                {corteModal.cabecera?.tiene_incongruencia && (
                    <div style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.4rem'
                    }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#EF4444' }}>
                            <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Observaciones de Auditoría:
                        </div>
                        <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {((corteModal.cabecera?.incongruencias?.length ? corteModal.cabecera.incongruencias : corteModal.cabecera?.alertas) || []).map((inc, i) => {
                                const text = typeof inc === 'string' ? inc : (inc?.texto || inc?.descripcion || inc?.tipo || '');
                                if (!text) return null;
                                return (
                                    <span key={i} style={{ fontSize: '0.72rem', color: 'var(--text)', background: 'var(--bg-card)', padding: '0.1rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        {text}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* KPI Ribbon (Compact 1-row summary) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem 0.75rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    fontSize: '0.78rem'
                }}>
                    <span>Venta: <strong style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{moneyFmt(corteModal.cabecera?.venta)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Tarjetas: <strong style={{ color: '#3B82F6' }}>{moneyFmt(corteModal.cabecera?.tarjeta)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Remesado: <strong style={{ color: '#10B981' }}>{moneyFmt(corteModal.cabecera?.remesado)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Gastos: <strong style={{ color: Number(corteModal.cabecera?.gastos || 0) > 0 ? '#EF4444' : 'var(--text)' }}>{moneyFmt(corteModal.cabecera?.gastos)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Ingresos: <strong style={{ color: 'var(--text)' }}>{moneyFmt(corteModal.cabecera?.ingresos)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Retiros: <strong style={{ color: 'var(--text)' }}>{moneyFmt(corteModal.cabecera?.retiros)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Saldo Final: <strong style={{ color: (corteModal.cabecera?.saldo_f || 0) < 0 ? '#EF4444' : 'var(--text)' }}>{moneyFmt(corteModal.cabecera?.saldo_f)}</strong></span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>Diferencia: <strong style={{ color: (corteModal.cabecera?.dif || 0) === 0 ? '#10B981' : (corteModal.cabecera?.dif || 0) < 0 ? '#EF4444' : '#F59E0B' }}>{moneyFmt(corteModal.cabecera?.dif)}</strong></span>
                </div>

                {/* Navigation tabs for Lineas vs Movimientos */}
                <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('lineas')}
                        style={{
                            padding: '0.35rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            border: 'none',
                            borderBottom: activeTab === 'lineas' ? '2px solid var(--primary)' : '2px solid transparent',
                            background: 'transparent',
                            color: activeTab === 'lineas' ? 'var(--primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                        }}
                    >
                        <Layers size={14} />
                        <span>Ventas por Línea ({corteModal.ventas_lineas?.length || 0})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('movimientos')}
                        style={{
                            padding: '0.35rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            border: 'none',
                            borderBottom: activeTab === 'movimientos' ? '2px solid var(--primary)' : '2px solid transparent',
                            background: 'transparent',
                            color: activeTab === 'movimientos' ? 'var(--primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                        }}
                    >
                        <Receipt size={14} />
                        <span>Detalle de Movimientos ({corteModal.detalles_movimientos?.length || 0})</span>
                        {(corteModal.detalles_movimientos || []).some(m => String(m.tipo || '').toUpperCase() === 'G' || m.es_generico || m.alerta) && (
                            <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '8px', background: '#EF4444', color: '#fff', fontWeight: 700 }} title="Contiene movimientos con observaciones de auditoría">
                                {(corteModal.detalles_movimientos || []).filter(m => String(m.tipo || '').toUpperCase() === 'G' || m.es_generico || m.alerta).length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content: Loading vs Content */}
                {corteModal.loading ? (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem auto', display: 'block', color: 'var(--primary)' }} />
                        <p style={{ fontSize: '0.825rem' }}>Cargando detalle del corte de tienda...</p>
                    </div>
                ) : (
                    <>
                        {/* Tab 1: Ventas por Línea */}
                        {activeTab === 'lineas' && (
                            <div className="table-responsive" style={{ minHeight: '260px', maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                <table className="table" style={{ width: '100%', minWidth: '550px', fontSize: '0.8rem', margin: 0 }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>
                                        <tr>
                                            <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left' }}>Línea de Producto</th>
                                            <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>Monto ($)</th>
                                            <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', width: '120px' }}>% Participación</th>
                                            <th style={{ padding: '0.45rem 0.6rem', width: '140px' }}>Distribución</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(corteModal.ventas_lineas || []).map((v, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.6rem', fontWeight: 500 }}>{v.linea}</td>
                                                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(v.monto)}</td>
                                                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{v.porcentaje}%</td>
                                                <td style={{ padding: '0.45rem 0.6rem' }}>
                                                    <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${Math.min(v.porcentaje, 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!corteModal.ventas_lineas || corteModal.ventas_lineas.length === 0) && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                    No hay líneas de venta registradas para este corte.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--bg-card)', fontWeight: 700 }}>
                                        <tr style={{ borderTop: '2px solid var(--border)' }}>
                                            <td style={{ padding: '0.5rem 0.6rem' }}>TOTAL VENTAS LÍNEAS</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                                {moneyFmt((corteModal.ventas_lineas || []).reduce((acc, curr) => acc + Number(curr.monto || 0), 0))}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>100%</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}

                        {/* Tab 2: Movimientos */}
                        {activeTab === 'movimientos' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {/* Sub-filter chips */}
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {[
                                            { key: 'ALL', label: 'Todos' },
                                            { key: 'ALERTS', label: '⚠️ Con Observaciones' },
                                            { key: 'G', label: 'Gastos' },
                                            { key: 'T', label: 'Tarjetas' },
                                            { key: 'R', label: 'Remesas' },
                                            { key: 'I', label: 'Ingresos' }
                                        ].map(filter => (
                                            <button
                                                key={filter.key}
                                                type="button"
                                                onClick={() => setFilterTipo(filter.key)}
                                                style={{
                                                    height: '26px',
                                                    padding: '0 0.65rem',
                                                    fontSize: '0.74rem',
                                                    borderRadius: '13px',
                                                    border: filterTipo === filter.key ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                    background: filterTipo === filter.key ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card)',
                                                    color: filterTipo === filter.key ? 'var(--primary)' : 'var(--text)',
                                                    cursor: 'pointer',
                                                    fontWeight: filterTipo === filter.key ? 600 : 400
                                                }}
                                            >
                                                {filter.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Search input */}
                                    <div style={{ position: 'relative', width: '220px' }}>
                                        <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar movimiento..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                height: '28px',
                                                padding: '0 0.5rem 0 1.7rem',
                                                fontSize: '0.75rem',
                                                borderRadius: 'var(--border-radius)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg-color)',
                                                color: 'var(--text)'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="table-responsive" style={{ minHeight: '260px', maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                    <table className="table" style={{ width: '100%', minWidth: '500px', fontSize: '0.8rem', margin: 0 }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>
                                            <tr>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'center', width: '90px' }}>Tipo</th>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left' }}>Descripción / Concepto</th>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', width: '120px' }}>Monto ($)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {movimientosFiltrados.map((mov, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            fontWeight: 600,
                                                            background: mov.tipo === 'G' ? 'rgba(239, 68, 68, 0.12)' : mov.tipo === 'T' ? 'rgba(59, 130, 246, 0.12)' : mov.tipo === 'R' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                                                            color: mov.tipo === 'G' ? '#EF4444' : mov.tipo === 'T' ? '#3B82F6' : mov.tipo === 'R' ? '#10B981' : '#8B5CF6'
                                                        }}>
                                                            {mov.tipo_nombre || mov.tipo}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.6rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                            <span>{mov.descripcion}</span>
                                                            {mov.tipo === 'G' && (
                                                                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Gasto no habitual en tienda">
                                                                    <AlertTriangle size={11} /> Gasto Tienda
                                                                </span>
                                                            )}
                                                            {mov.es_generico && (
                                                                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#D97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Descripción genérica o poco específica">
                                                                    <AlertCircle size={11} /> Concepto Genérico
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: mov.tipo === 'G' ? '#EF4444' : 'var(--text)' }}>
                                                        {moneyFmt(mov.monto)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {movimientosFiltrados.length === 0 && (
                                                <tr>
                                                    <td colSpan="3" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                        No se encontraron movimientos registrados con los filtros seleccionados.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--bg-card)', fontWeight: 700 }}>
                                            <tr style={{ borderTop: '2px solid var(--border)' }}>
                                                <td colSpan="2" style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>TOTAL MOVIMIENTOS:</td>
                                                <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                                    {moneyFmt(movimientosFiltrados.reduce((acc, curr) => acc + Number(curr.monto || 0), 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </Modal>
    );
}
