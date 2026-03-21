import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Database, Save, Activity, Mail, Send } from 'lucide-react';

export default function Settings() {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);

    // Database Config State
    const [config, setConfig] = useState({
        host: '', user: '', password: '', database_name: '', port: 3306
    });
    const [savingDB, setSavingDB] = useState(false);

    // Email Config State
    const [emailConfig, setEmailConfig] = useState({
        host: '', port: 587, secure: false, user: '', password: '', from_address: ''
    });
    const [testEmail, setTestEmail] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const [dbRes, emailRes] = await Promise.all([
                api.get('/config').catch(() => ({ data: {} })),
                api.get('/config/email').catch(() => ({ data: {} }))
            ]);
            if (dbRes.data?.id) setConfig(dbRes.data);
            if (emailRes.data?.id) setEmailConfig(emailRes.data);
        } catch (err) {
            addToast('Error al cargar la configuración', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDBSubmit = async (e) => {
        e.preventDefault();
        setSavingDB(true);
        try {
            const res = await api.post('/config', config);
            addToast(res.data.message, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la configuración BD', 'error');
        } finally {
            setSavingDB(false);
        }
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setSavingEmail(true);
        try {
            const res = await api.post('/config/email', emailConfig);
            addToast(res.data.message, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la configuración de correo', 'error');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleEmailTest = async () => {
        if (!testEmail) {
            addToast('Ingresa un correo destinatario para la prueba', 'error');
            return;
        }
        setTestingEmail(true);
        try {
            const res = await api.post('/config/email/test', { ...emailConfig, to_email: testEmail });
            addToast(res.data.message, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al probar conexión SMTP', 'error');
        } finally {
            setTestingEmail(false);
        }
    };

    if (loading) return <div>Cargando...</div>;

    return (
        <div style={{ maxWidth: '800px', paddingBottom: '3rem' }}>
            <div style={{ display: 'grid', gap: '2rem' }}>
                
                {/* DATABASE CONFIGURATION SECTION */}
                <div>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Database size={24} color="var(--primary)" />
                        <div>
                            <h2 style={{ margin: 0 }}>Base de Datos Externa</h2>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>Conexión MySQL para operaciones y consultas consolidadas.</p>
                        </div>
                    </div>

                    <div className="card glass">
                        <form onSubmit={handleDBSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Host / IP</label>
                                    <input type="text" className="form-control" value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value })} placeholder="e.g. 1.2.3.4 o localhost" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Puerto</label>
                                    <input type="number" className="form-control" value={config.port} onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })} placeholder="3306" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Usuario</label>
                                    <input type="text" className="form-control" value={config.user} onChange={(e) => setConfig({ ...config, user: e.target.value })} placeholder="sysadmin" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Contraseña</label>
                                    <input type="password" className="form-control" value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} placeholder="••••••••" required />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre de la Base de Datos</label>
                                    <input type="text" className="form-control" value={config.database_name} onChange={(e) => setConfig({ ...config, database_name: e.target.value })} placeholder="db_main" required />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                                <button type="submit" className="btn-primary" disabled={savingDB} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <Save size={18} /> {savingDB ? 'Probando...' : 'Guardar y Probar Conexión'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* EMAIL CONFIGURATION SECTION */}
                <div style={{ marginTop: '1rem' }}>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Mail size={24} color="#f59e0b" />
                        <div>
                            <h2 style={{ margin: 0 }}>Servidor de Correo (SMTP)</h2>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>Credenciales para el envío de notificaciones automatizadas.</p>
                        </div>
                    </div>

                    <div className="card glass">
                        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Servidor SMTP (Host)</label>
                                    <input type="text" className="form-control" value={emailConfig.host} onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })} placeholder="smtp.gmail.com" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Puerto SMTP</label>
                                    <input type="number" className="form-control" value={emailConfig.port} onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) })} placeholder="587 o 465" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Usuario / Correo Origin</label>
                                    <input type="text" className="form-control" value={emailConfig.user} onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })} placeholder="tu-correo@empresa.com" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Contraseña (App Password)</label>
                                    <input type="password" className="form-control" value={emailConfig.password} onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })} placeholder="••••••••" required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nombre del Remitente</label>
                                    <input type="text" className="form-control" value={emailConfig.from_address} onChange={(e) => setEmailConfig({ ...emailConfig, from_address: e.target.value })} placeholder="SIPE Notificaciones" required />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                        <input type="checkbox" checked={emailConfig.secure} onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                        Usar Conexión Segura (SSL/TLS - Ej. Puerto 465)
                                    </label>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: '300px' }}>
                                    <input type="email" className="form-control" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Correo secundario para prueba" />
                                    <button type="button" className="btn-secondary" onClick={handleEmailTest} disabled={testingEmail} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                                        <Send size={16} /> {testingEmail ? 'Enviando...' : 'Probar Envío'}
                                    </button>
                                </div>

                                <button type="submit" className="btn-primary" disabled={savingEmail} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <Save size={18} /> {savingEmail ? 'Guardando...' : 'Guardar Datos SMTP'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
