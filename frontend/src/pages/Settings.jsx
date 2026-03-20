import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Database, Save, Activity } from 'lucide-react';

export default function Settings() {
    const [config, setConfig] = useState({
        host: '',
        user: '',
        password: '',
        database_name: '',
        port: 3306
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await api.get('/config');
            if (res.data.id) setConfig(res.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar la configuración', 'error');
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.post('/config', config);
            addToast(res.data.message, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la configuración', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1>Configuración de Base de Datos</h1>
                <p style={{ color: 'var(--text-muted)' }}>Configura la conexión a la base de datos MySQL externa para consultas.</p>
            </div>

            <div className="card glass">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Host / IP</label>
                            <input
                                type="text"
                                value={config.host}
                                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                                placeholder="e.g. 1.2.3.4 o localhost"
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Puerto</label>
                            <input
                                type="number"
                                value={config.port}
                                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                                placeholder="3306"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Usuario</label>
                            <input
                                type="text"
                                value={config.user}
                                onChange={(e) => setConfig({ ...config, user: e.target.value })}
                                placeholder="sysadmin"
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Contraseña</label>
                            <input
                                type="password"
                                value={config.password}
                                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de la Base de Datos</label>
                            <input
                                type="text"
                                value={config.database_name}
                                onChange={(e) => setConfig({ ...config, database_name: e.target.value })}
                                placeholder="db_main"
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="submit" className="btn-primary" disabled={saving} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Save size={18} />
                            {saving ? 'Probando y Guardando...' : 'Guardar y Probar Conexión'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="card glass" style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(37, 99, 235, 0.1)' }}>
                <div style={{ padding: '12px', background: 'var(--primary)', borderRadius: '50%', color: 'white' }}>
                    <Activity size={24} />
                </div>
                <div>
                    <h3 style={{ fontSize: '1rem' }}>Estado de Conexión</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {config.id ? 'Conexión configurada correctamente' : 'Sin configurar'}
                    </p>
                </div>
            </div>
        </div>
    );
}
