import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Database, Save } from 'lucide-react';

export default function ConfiguracionContabilidad() {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState({
        host: '', user: '', password: '', database_name: '', port: 3306
    });
    const [savingDB, setSavingDB] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await api.get('/config/accounting').catch(() => ({ data: {} }));
            if (res.data?.id) setConfig(res.data);
        } catch (err) {
            addToast('Error al cargar la configuración de contabilidad', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSavingDB(true);
        try {
            const res = await api.post('/config/accounting', config);
            addToast(res.data.message, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la configuración de contabilidad', 'error');
        } finally {
            setSavingDB(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-muted">Cargando configuración...</div>;

    return (
        <div style={{ maxWidth: '800px', padding: '2rem' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Database size={32} color="#10b981" />
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Conexión Contabilidad</h1>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Conexión MySQL para la extracción de datos contables externos.</p>
                </div>
            </div>

            <div className="card glass shadow-lg" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Host / IP</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={config.host} 
                                onChange={(e) => setConfig({ ...config, host: e.target.value })} 
                                placeholder="e.g. 1.2.3.4 o localhost" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Puerto</label>
                            <input 
                                type="number" 
                                className="form-control" 
                                value={config.port} 
                                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })} 
                                placeholder="3306" 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Usuario</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={config.user} 
                                onChange={(e) => setConfig({ ...config, user: e.target.value })} 
                                placeholder="sysadmin" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Contraseña</label>
                            <input 
                                type="password" 
                                className="form-control" 
                                value={config.password} 
                                onChange={(e) => setConfig({ ...config, password: e.target.value })} 
                                placeholder="••••••••" 
                                required 
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Nombre de la Base de Datos</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={config.database_name} 
                                onChange={(e) => setConfig({ ...config, database_name: e.target.value })} 
                                placeholder="db_accounting" 
                                required 
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
                        <button type="submit" className="btn-primary" disabled={savingDB} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem 1.5rem', backgroundColor: '#10b981' }}>
                            <Save size={18} /> {savingDB ? 'Probando...' : 'Guardar y Probar Conexión'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
