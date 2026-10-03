import React, { useState, useEffect } from 'react';
import { 
    FileSpreadsheet, AlertTriangle, Search, RefreshCw, AlertCircle 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../Modal';

const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

export default function DrillDownPistaModal({ drillDownModal, onClose, fecha }) {
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setSearchTerm('');
    }, [drillDownModal]);

    if (!drillDownModal) return null;

    const exportToExcel = () => {
        if (!drillDownModal || !drillDownModal.data?.length) return;
        const wb = XLSX.utils.book_new();
        const rows = [
            [`DETALLE DE CIERRE DE TURNO: ${drillDownModal.titulo.toUpperCase()}`],
            ['Estación:', drillDownModal.estacion_nombre],
            ['Rubro:', drillDownModal.rubro],
            ['Fecha:', drillDownModal.fecha_turno || drillDownModal.fecha || fecha],
            ['Total Acumulado:', `$${drillDownModal.total}`],
            ['']
        ];
        
        if (drillDownModal.rubro === 'gastos') {
            rows.push(['Rubro', 'Fecha', 'Documento', 'Tipo Doc', 'Código Proveedor', 'Nombre / Proveedor', 'Valor ($)', 'Concepto']);
            drillDownModal.data.forEach(r => {
                rows.push([r.rubro, r.fecha, r.documento, r.tipo_doc, r.codigo, r.nombre, r.valor, r.concepto]);
            });
            rows.push(['', '', '', '', '', 'TOTAL', drillDownModal.total, '']);
        } else if (drillDownModal.rubro === 'tarjetas') {
            rows.push(['#', 'Fecha', 'Tarjeta', 'Autorización', 'Banco / POS', 'Operación', 'Valor ($)']);
            drillDownModal.data.forEach((r, idx) => {
                rows.push([idx + 1, r.fecha, r.tarjeta, r.autorizacion, r.banco, r.tipo_operacion, r.valor]);
            });
            rows.push(['', '', '', '', '', 'TOTAL', drillDownModal.total]);
        } else if (drillDownModal.rubro === 'remesas') {
            rows.push(['#', 'Fecha', 'Documento', 'Banco', 'Efectivo ($)', 'Monedas ($)', 'Transferencia ($)', 'Total ($)', 'Voucher']);
            drillDownModal.data.forEach((r, idx) => {
                rows.push([idx + 1, r.fecha, r.documento, r.banco, r.efectivo, r.monedas, r.transferencia, r.total, r.voucher]);
            });
            rows.push(['', '', '', 'TOTALES', '', '', '', drillDownModal.total, '']);
        } else if (drillDownModal.rubro === 'credito' || drillDownModal.rubro === 'creditos') {
            rows.push(['#', 'Fecha', 'Documento', 'Tipo Doc', 'Cliente', 'Producto', 'Cantidad', 'Precio ($)', 'Valor ($)', 'Placa']);
            drillDownModal.data.forEach((r, idx) => {
                rows.push([idx + 1, r.fecha, r.documento, r.tipo_doc, r.cliente, r.producto, r.cantidad, r.precio, r.valor, r.placa]);
            });
            rows.push(['', '', '', '', '', '', '', 'TOTAL', drillDownModal.total, '']);
        } else if (drillDownModal.rubro === 'lubricantes') {
            rows.push(['Código', 'Producto', 'Inicial', 'Complemento', 'Final', 'Ventas', 'Precio Unit ($)', 'Precio Total ($)']);
            drillDownModal.data.forEach(r => {
                rows.push([r.codigo, r.producto, r.inicial, r.complemento, r.final, r.ventas, r.precio_unitario, r.precio_total]);
            });
            rows.push(['', '', '', '', '', '', 'TOTAL', drillDownModal.total]);
        } else if (drillDownModal.rubro === 'lecturas') {
            rows.push(['Turno', 'Código', 'Producto', 'Galones', 'Precio ($)', 'Monto ($)']);
            drillDownModal.data.forEach(r => {
                rows.push([`T-${r.turno || 1}`, r.codigo, r.producto, r.galones, r.precio, r.monto]);
            });
            const totGalones = Math.round(drillDownModal.data.reduce((acc, curr) => acc + Number(curr.galones || 0), 0) * 100) / 100;
            rows.push(['', '', 'TOTAL', totGalones, '', drillDownModal.total]);
        } else {
            const keys = Object.keys(drillDownModal.data[0] || {});
            rows.push(keys);
            drillDownModal.data.forEach(r => {
                rows.push(keys.map(k => r[k]));
            });
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Detalle');
        XLSX.writeFile(wb, `Cierre_${drillDownModal.estacion_nombre.replace(/\s+/g, '_')}_${drillDownModal.rubro}_${fecha}.xlsx`);
    };

    const query = (searchTerm || '').toLowerCase().trim();
    const filteredRows = (drillDownModal.data || []).filter(item => {
        if (!query) return true;
        return Object.values(item).some(val => 
            val !== null && val !== undefined && String(val).toLowerCase().includes(query)
        );
    });

    return (
        <Modal
            isOpen={Boolean(drillDownModal)}
            onClose={onClose}
            title={drillDownModal.titulo}
            size="xl"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Header info bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Fecha: <strong style={{ color: 'var(--text)' }}>{drillDownModal.fecha_turno || drillDownModal.fecha || fecha}</strong>
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Estación: <strong style={{ color: 'var(--primary)' }}>{drillDownModal.estacion_nombre}</strong>
                        </span>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: 'var(--primary)'
                        }}>
                            {drillDownModal.rubro.toUpperCase()}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Total Registrado</span>
                            <strong style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>
                                {moneyFmt(drillDownModal.total)}
                            </strong>
                        </div>
                        <button
                            type="button"
                            onClick={exportToExcel}
                            className="btn btn-secondary"
                            style={{ height: '36px', padding: '0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                            disabled={!drillDownModal.data?.length}
                            title="Exportar a Excel"
                        >
                            <FileSpreadsheet size={16} color="#10B981" />
                            <span>Excel</span>
                        </button>
                    </div>
                </div>

                {/* Incongruencias notice for gastos */}
                {drillDownModal.rubro === 'gastos' && (drillDownModal.data || []).some(r => r.es_incongruente) && (
                    <div style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.78rem',
                        color: '#D97706'
                    }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>Se detectaron <strong>{(drillDownModal.data || []).filter(r => r.es_incongruente).length}</strong> registros con observaciones de auditoría (sin documento de respaldo o con concepto vago/genérico).</span>
                    </div>
                )}

                {/* Search filter input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '380px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por documento, nombre, concepto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                height: '34px',
                                padding: '0 0.75rem 0 2rem',
                                fontSize: '0.8rem',
                                borderRadius: 'var(--border-radius)',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-color)',
                                color: 'var(--text)'
                            }}
                        />
                    </div>
                    {searchTerm && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setSearchTerm('')}
                            style={{ height: '34px', padding: '0 0.6rem', fontSize: '0.75rem' }}
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* Content area: Loading vs Table */}
                {drillDownModal.loading ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem auto', display: 'block', color: 'var(--primary)' }} />
                        <p style={{ fontSize: '0.85rem' }}>Cargando registros detallados de {drillDownModal.rubro}...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 'var(--border-radius)' }}>
                        <p style={{ fontSize: '0.85rem' }}>No se encontraron comprobantes ni movimientos para este rubro con los filtros aplicados.</p>
                    </div>
                ) : (
                    <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                        <table className="table" style={{ width: '100%', minWidth: '750px', fontSize: '0.8rem' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>
                                {drillDownModal.rubro === 'gastos' && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Rubro</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Docu.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Tipo</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Código</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Nombre / Proveedor</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Valor ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Concepto</th>
                                    </tr>
                                )}
                                {drillDownModal.rubro === 'tarjetas' && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '40px' }}>#</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Tarjeta</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Autorización</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Banco / POS</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Operación</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Valor ($)</th>
                                    </tr>
                                )}
                                {drillDownModal.rubro === 'remesas' && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '40px' }}>#</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Documento</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Banco</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Efectivo</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monedas</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Transfer.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Total ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Voucher</th>
                                    </tr>
                                )}
                                {(drillDownModal.rubro === 'credito' || drillDownModal.rubro === 'creditos') && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '40px' }}>#</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Documento</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Tipo</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Cliente</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Prod.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Cantidad</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Precio ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Valor ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Placa</th>
                                    </tr>
                                )}
                                {drillDownModal.rubro === 'lubricantes' && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Código</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Producto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Inicial</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Complem.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Final</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Ventas</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>P. Unit ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>P. Total ($)</th>
                                    </tr>
                                )}
                                {drillDownModal.rubro === 'lecturas' && (
                                    <tr>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '70px' }}>Turno</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', width: '100px' }}>Código</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Producto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', width: '120px' }}>Galones</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', width: '110px' }}>Precio ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', width: '120px' }}>Monto ($)</th>
                                    </tr>
                                )}
                                {!['gastos', 'tarjetas', 'remesas', 'credito', 'creditos', 'lubricantes', 'lecturas'].includes(drillDownModal.rubro) && (
                                    <tr>
                                        {Object.keys(filteredRows[0] || {}).map(k => (
                                            <th key={k} style={{ padding: '0.45rem 0.5rem', textAlign: typeof filteredRows[0][k] === 'number' ? 'right' : 'left' }}>
                                                {k.replace(/_/g, ' ').toUpperCase()}
                                            </th>
                                        ))}
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {filteredRows.map((r, idx) => (
                                    <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                        {drillDownModal.rubro === 'gastos' && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                                                        {r.rubro}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>
                                                    {r.falta_documento ? (
                                                        <span style={{ color: '#EF4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Sin número de comprobante o documento de respaldo">
                                                            <AlertTriangle size={12} /> {r.documento || 'S/D'}
                                                        </span>
                                                    ) : (
                                                        r.documento
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{r.tipo_doc}</span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)' }}>{r.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{r.nombre}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>
                                                    {moneyFmt(r.valor)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)', maxWidth: '250px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                        <span>{r.concepto}</span>
                                                        {r.es_generico && (
                                                            <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#D97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }} title="Concepto vago o poco descriptivo">
                                                                <AlertCircle size={10} /> Vago
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                        {drillDownModal.rubro === 'tarjetas' && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace' }}>{r.tarjeta}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>{r.autorizacion}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{r.banco}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                                                        {r.tipo_operacion}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                                    {moneyFmt(r.valor)}
                                                </td>
                                            </>
                                        )}
                                        {drillDownModal.rubro === 'remesas' && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{r.documento}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>{r.banco}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{moneyFmt(r.efectivo)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{moneyFmt(r.monedas)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{moneyFmt(r.transferencia)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                                                    {moneyFmt(r.total)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)' }}>{r.voucher}</td>
                                            </>
                                        )}
                                        {(drillDownModal.rubro === 'credito' || drillDownModal.rubro === 'creditos') && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{r.documento}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{r.tipo_doc}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{r.cliente}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>{r.producto}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{numFmt(r.cantidad)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>${r.precio}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(r.valor)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)' }}>{r.placa}</td>
                                            </>
                                        )}
                                        {drillDownModal.rubro === 'lubricantes' && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)' }}>{r.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{r.producto}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{r.inicial}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{r.complemento}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{r.final}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{r.ventas}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{moneyFmt(r.precio_unitario)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(r.precio_total)}</td>
                                            </>
                                        )}
                                        {drillDownModal.rubro === 'lecturas' && (
                                            <>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', fontWeight: 600 }}>
                                                        T-{r.turno}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)' }}>{r.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{r.producto}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{numFmt(r.galones)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>${r.precio}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{moneyFmt(r.monto)}</td>
                                            </>
                                        )}
                                        {!['gastos', 'tarjetas', 'remesas', 'credito', 'creditos', 'lubricantes', 'lecturas'].includes(drillDownModal.rubro) && (
                                            <>
                                                {Object.keys(r).map(k => (
                                                    <td key={k} style={{ padding: '0.45rem 0.5rem', textAlign: typeof r[k] === 'number' ? 'right' : 'left' }}>
                                                        {typeof r[k] === 'number' ? (k.includes('precio') || k.includes('valor') || k.includes('monto') || k.includes('total') ? moneyFmt(r[k]) : numFmt(r[k])) : String(r[k] ?? '-')}
                                                    </td>
                                                ))}
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--bg-card)', fontWeight: 700 }}>
                                {drillDownModal.rubro === 'lecturas' ? (
                                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={3} style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>
                                            TOTAL ACUMULADO:
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 700 }}>
                                            {numFmt(filteredRows.reduce((acc, curr) => acc + Number(curr.galones || 0), 0))} gl
                                        </td>
                                        <td style={{ padding: '0.5rem' }}></td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 700 }}>
                                            {moneyFmt(filteredRows.reduce((acc, curr) => acc + Number(curr.monto || 0), 0))}
                                        </td>
                                    </tr>
                                ) : (
                                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={drillDownModal.rubro === 'gastos' ? 6 : drillDownModal.rubro === 'tarjetas' ? 6 : drillDownModal.rubro === 'remesas' ? 7 : (drillDownModal.rubro === 'credito' || drillDownModal.rubro === 'creditos') ? 8 : drillDownModal.rubro === 'lubricantes' ? 7 : 1} style={{ padding: '0.5rem', textAlign: 'right' }}>
                                            TOTAL ACUMULADO:
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--primary)', fontSize: '0.9rem' }}>
                                            {moneyFmt(filteredRows.reduce((acc, curr) => acc + Number(curr.valor || curr.total || curr.monto || curr.precio_total || 0), 0))}
                                        </td>
                                        {(drillDownModal.rubro === 'gastos' || drillDownModal.rubro === 'remesas' || drillDownModal.rubro === 'credito' || drillDownModal.rubro === 'creditos') && (
                                            <td style={{ padding: '0.5rem' }}></td>
                                        )}
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                    </div>
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
