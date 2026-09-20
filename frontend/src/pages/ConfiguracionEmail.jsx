import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Mail, Save, Send } from 'lucide-react';

export default function ConfiguracionEmail() {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [emailConfig, setEmailConfig] = useState({
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        from_address: '',
        office_email: ''
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
            if (res.data?.id) {
                setEmailConfig({
                    ...res.data,
                    office_email: res.data.office_email || ''
                });
            }
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
            addToast(res.data.message || 'Configuración guardada exitosamente', 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la configuración de correo', 'error');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleEmailTest = async () => {
        const targetEmail = testEmail || emailConfig.office_email;
        if (!targetEmail) {
            addToast('Ingresa un correo destinatario para la prueba o configura el correo de oficina', 'error');
            return;
        }
        setTestingEmail(true);
        try {
            const res = await api.post('/config/email/test', { ...emailConfig, to_email: targetEmail });
            addToast(res.data.message || 'Correo de prueba enviado con éxito', 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al probar conexión SMTP', 'error');
        } finally {
            setTestingEmail(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-muted">Cargando configuración...</div>;

    return (
        <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="page-header" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Mail size={22} color="var(--primary, #3b82f6)" />
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Configuración de Correo</h1>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>
                        Credenciales SMTP y dirección de correo de oficina para notificaciones y alertas.
                    </p>
                </div>
            </div>

            <div className="card glass shadow-sm" style={{ padding: '1.25rem 1.5rem' }}>
                <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>Servidor SMTP (Host)</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.host} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })} 
                                placeholder="smtp.gmail.com" 
                                required 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>Puerto SMTP</label>
                            <input 
                                type="number" 
                                className="form-control" 
                                value={emailConfig.port} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) || 587 })} 
                                placeholder="587 o 465" 
                                required 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>Usuario / Correo Remitente (SMTP)</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.user} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })} 
                                placeholder="notificaciones@empresa.com" 
                                required 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>Contraseña (App Password)</label>
                            <input 
                                type="password" 
                                className="form-control" 
                                value={emailConfig.password} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })} 
                                placeholder="••••••••" 
                                required 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>Nombre del Remitente</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={emailConfig.from_address} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, from_address: e.target.value })} 
                                placeholder="SIPE Notificaciones" 
                                required 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.825rem', fontWeight: '500' }}>
                                Correo de Oficina
                            </label>
                            <input 
                                type="email" 
                                className="form-control" 
                                value={emailConfig.office_email} 
                                onChange={(e) => setEmailConfig({ ...emailConfig, office_email: e.target.value })} 
                                placeholder="oficina@empresa.com" 
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Correo principal de la oficina para recepción de copias y reportes.
                            </span>
                        </div>
                        <div className="span-2" style={{ display: 'flex', alignItems: 'center', marginTop: '0.25rem' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={emailConfig.secure} 
                                    onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })} 
                                    style={{ width: '16px', height: '16px' }} 
                                />
                                Usar Conexión Segura (SSL/TLS)
                            </label>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border, rgba(255,255,255,0.1))', paddingTop: '1rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
                            <input 
                                type="email" 
                                className="form-control" 
                                value={testEmail} 
                                onChange={e => setTestEmail(e.target.value)} 
                                placeholder={emailConfig.office_email ? `Destinatario (vacío usa ${emailConfig.office_email})` : "Correo para prueba de envío"} 
                                style={{ height: '36px', fontSize: '0.825rem', minWidth: '220px', flex: 1 }}
                            />
                            <button 
                                type="button" 
                                className="btn-secondary" 
                                onClick={handleEmailTest} 
                                disabled={testingEmail} 
                                style={{ height: '36px', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', whiteSpace: 'nowrap', fontSize: '0.825rem', padding: '0 1rem' }}
                            >
                                <Send size={15} /> {testingEmail ? 'Enviando...' : 'Probar Envío'}
                            </button>
                        </div>

                        <button 
                            type="submit" 
                            className="btn-primary" 
                            disabled={savingEmail} 
                            style={{ height: '36px', display: 'inline-flex', gap: '0.45rem', alignItems: 'center', padding: '0 1.25rem', fontSize: '0.825rem' }}
                        >
                            <Save size={16} /> {savingEmail ? 'Guardando...' : 'Guardar Configuración'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
