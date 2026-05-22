import React, { useState, useEffect } from 'react';
import { HardDrive, RefreshCw, Folder, File, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const BackupDBCheck = () => {
    const { addToast } = useToast();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        fetchData(false);
    }, []);

    // Timer to show elapsed seconds while loading
    useEffect(() => {
        let interval;
        if (loading) {
            setElapsed(0);
            interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [loading]);

    const fetchData = async (force = false) => {
        setLoading(true);
        try {
            const res = await api.get('/onedrive/estado' + (force ? '?force=1' : ''));
            setData(res.data || []);
        } catch (e) {
            addToast('Error al consultar estado de backups: ' + (e.response?.data?.detail || e.response?.data?.message || e.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const getLabel = (antiguedad, archivo) => {
        if (archivo === '(vacia)' || archivo === '(sin acceso)' || archivo === '(error)') return 'Sin archivos';
        if (antiguedad === null) return '?';
        if (antiguedad === 0) return 'Hoy';
        if (antiguedad === 1) return 'Ayer';
        return `${antiguedad} días`;
    };

    const getIcon = (antiguedad, archivo) => {
        if (archivo === '(vacia)' || archivo === '(sin acceso)' || archivo === '(error)') return <AlertTriangle size={14} />;
        if (antiguedad === null) return <Clock size={14} />;
        if (antiguedad <= 2) return <CheckCircle size={14} />;
        if (antiguedad <= 4) return <Clock size={14} />;
        return <AlertTriangle size={14} />;
    };

    const getColor = (antiguedad, archivo) => {
        if (archivo === '(vacia)' || archivo === '(sin acceso)' || archivo === '(error)') return 'var(--text-muted)';
        if (antiguedad === null) return 'var(--text-muted)';
        if (antiguedad <= 2) return 'var(--success)';
        if (antiguedad <= 4) return '#f59e0b';
        return 'var(--danger)';
    };

    const getBg = (antiguedad, archivo) => {
        if (archivo === '(vacia)' || archivo === '(sin acceso)' || archivo === '(error)') return 'rgba(255,255,255,0.03)';
        if (antiguedad === null) return 'rgba(255,255,255,0.05)';
        if (antiguedad <= 2) return 'rgba(34,197,94,0.12)';
        if (antiguedad <= 4) return 'rgba(245,158,11,0.12)';
        return 'rgba(239,68,68,0.12)';
    };

    const fmtFecha = (val) => {
        if (!val) return '-';
        const d = new Date(val);
        return d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
            ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    };

    const sortedData = [...data].sort((a, b) => {
        if (a.antiguedad === null && b.antiguedad === null) return 0;
        if (a.antiguedad === null) return 1;
        if (b.antiguedad === null) return -1;
        return b.antiguedad - a.antiguedad;
    });

    return (
        <div style={{ padding: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <HardDrive size={32} color="var(--primary)" />
                    <div>
                        <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}>Backup DB Check</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Estado de los backups diarios de base de datos en OneDrive.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => fetchData(false)}
                        className="btn-primary"
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw size={18} className={loading ? 'spin' : ''} /> Actualizar
                    </button>
                    <button
                        onClick={() => fetchData(true)}
                        className="btn-primary"
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)'
                        }}
                        title="Fuerza una recarga directa desde OneDrive, ignorando el caché"
                    >
                        <RefreshCw size={18} /> Forzar Recarga
                    </button>
                </div>
            </div>

            <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Carpeta</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Último Archivo</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'center', width: '120px' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '4rem', textAlign: 'center' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
                                            Consultando OneDrive... {elapsed > 3 && <span>({elapsed}s)</span>}
                                        </p>
                                    </td>
                                </tr>
                            ) : sortedData.length > 0 ? (
                                sortedData.map((item, idx) => (
                                    <tr key={idx} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Folder size={16} color="var(--primary)" />
                                                <span style={{ fontWeight: 500 }}>{item.carpeta}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <File size={14} color="var(--text-muted)" />
                                                <span style={{ fontSize: '0.8rem' }}>{item.archivo}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {fmtFecha(item.fecha)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.25rem 0.6rem',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: getColor(item.antiguedad, item.archivo),
                                                background: getBg(item.antiguedad, item.archivo),
                                                border: `1px solid ${getColor(item.antiguedad, item.archivo)}30`
                                            }}>
                                                {getIcon(item.antiguedad, item.archivo)}
                                                {getLabel(item.antiguedad, item.archivo)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <HardDrive size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No se encontraron carpetas de backup.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BackupDBCheck;
