import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Lock, User, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const hasShownToast = React.useRef(false);
    const isExpired = !!searchParams.get('expired');

    useEffect(() => {
        if (isExpired) {
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            } catch (_) {
                /* ignore */
            }

            if (!hasShownToast.current) {
                addToast('Su sesión ha caducado. Por favor, inicie sesión de nuevo.', 'error');
                hasShownToast.current = true;
            }
        }
    }, [isExpired, addToast]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/login', { username, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const data = err.response?.data;
            if (data && data.error) {
                const errMsg = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
                setError(`${data.message || ''}: ${errMsg}${data.detail ? ' (' + data.detail + ')' : ''}`);
            } else {
                setError(data?.message || err.message || 'Error de conexión');
            }
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '1rem' }}>
            <div className="card glass" style={{ width: '100%', maxWidth: '400px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>SIPE Admin</h2>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: isExpired ? '1rem' : '2rem' }}>Inicia sesión para continuar</p>
                
                {isExpired && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--danger)',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--border-radius)',
                        fontSize: '0.85rem',
                        marginBottom: '1.25rem',
                        lineHeight: 1.4
                    }}>
                        <AlertCircle size={18} style={{ flexShrink: 0 }} />
                        <span>Su sesión ha caducado por seguridad. Por favor, ingrese de nuevo.</span>
                    </div>
                )}

                {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ position: 'relative' }}>
                        <User size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                            required
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                        <input
                            type="password"
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                            required
                        />
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: '0.75rem' }}>
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
}
