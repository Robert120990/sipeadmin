import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Mail, Save, Send } from 'lucide-react';

export default function ConfiguracionEmail() {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [emailConfig, setEmailConfig] = useState({
        host: '', port: 587, secure: false, user: '', password: '', from_address: ''
    });
    const [testEmail, setTestEmail] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await api.get('/config/email').catch(() => ({ data: {} }));
            if (res.data?.id) setEmailConfig(res.data);
        } catch (err) {
            addToast('Error al cargar la configuración de correo', 'error');
        } finally {
            setLoading(false);
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

    if (loading) return <div className="p-8 text-center text-muted">Cargando configuración...</div>;

    return (
        <div style={{ maxWidth: '800px', padding: '2rem' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Mail size={32} color="#f59e0b" />
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Configuración de Correo</h1>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Credenciales para el envío de notificaciones automatizadas mediante SMTP.</p>
                </div>
            </div>

            <div className="card glass shadow-lg" style={{ padding: '2rem' }}>
                <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Servidor SMTP (Host)</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.host} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })} 
                                placeholder="smtp.gmail.com" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Puerto SMTP</label>
                            <input 
                                type="number" 
                                className="form-control" 
                                value={emailConfig.port} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) })} 
                                placeholder="587 o 465" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Usuario / Correo Origen</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.user} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })} 
                                placeholder="tu-correo@empresa.com" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Contraseña (App Password)</label>
                            <input 
                                type="password" 
                                className="form-control" 
                                value={emailConfig.password} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })} 
                                placeholder="••••••••" 
                                required 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Nombre del Remitente</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.from_address} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, from_address: e.target.value })} 
                                placeholder="SIPE Notificaciones" 
                                required 
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                <input 
                                    type="checkbox" 
                                    checked={emailConfig.secure} 
                                    onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })} 
                                    style={{ width: '18px', height: '18px' }} 
                                />
                                Usar Conexión Segura (SSL/TLS)
                            </label>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: '300px' }}>
                            <input 
                                type="email" 
                                className="form-control" 
                                value={testEmail} 
                                onChange={e => setTestEmail(e.target.value)} 
                                placeholder="Correo para prueba de envío" 
                            />
                            <button 
                                type="button" 
                                className="btn-secondary" 
                                onClick={handleEmailTest} 
                                disabled={testingEmail} 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
                            >
                                <Send size={16} /> {testingEmail ? 'Enviando...' : 'Probar Envío'}
                            </button>
                        </div>

                        <button 
                            type="submit" 
                            className="btn-primary" 
                            disabled={savingEmail} 
                            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem 1.5rem' }}
                        >
                            <Save size={18} /> {savingEmail ? 'Guardando...' : 'Guardar Datos SMTP'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
