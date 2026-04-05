import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Lock, User } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const hasShownToast = React.useRef(false);

    useEffect(() => {
        if (searchParams.get('expired') && !hasShownToast.current) {
            addToast('Su sesión ha caducado. Por favor, inicie sesión de nuevo.', 'error');
            hasShownToast.current = true;
        }
    }, [searchParams, addToast]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/login', { username, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            navigate('/dashboard');
        } catch (err) {
            const data = err.response?.data;
            if (data && data.error) {
                setError(`${data.message}: ${data.error} (${data.detail || ''})`);
            } else {
                setError(data?.message || err.message || 'Error de conexión');
            }
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="card glass" style={{ width: '100%', maxWidth: '400px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>SIPE Admin</h2>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>Inicia sesión para continuar</p>
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
