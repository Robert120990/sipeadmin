import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
    Compass, Fuel, DollarSign, ShieldAlert, TrendingUp, CheckCircle2 
} from 'lucide-react';

const ESTRATEGIA_TABS = [
    { 
        path: '/dashboard/estrategia/torre-control', 
        name: 'Torre de Control', 
        icon: Compass,
        badge: 'Flash'
    },
    { 
        path: '/dashboard/estrategia/combustible', 
        name: 'Combustible & DGEHM', 
        icon: Fuel 
    },
    { 
        path: '/dashboard/estrategia/flujo-caja', 
        name: 'Flujo Predictivo', 
        icon: DollarSign 
    },
    { 
        path: '/dashboard/estrategia/mermas', 
        name: 'Auditoría Mermas', 
        icon: ShieldAlert 
    },
    { 
        path: '/dashboard/estrategia/rentabilidad', 
        name: 'P&L por Estación', 
        icon: TrendingUp 
    },
    { 
        path: '/dashboard/estrategia/creditos', 
        name: 'Crédito y Flotas', 
        icon: CheckCircle2 
    }
];

export default function EstrategiaNav() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <div 
            className="estrategia-subnav"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                overflowX: 'auto',
                padding: '0.35rem 0.5rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                marginBottom: '0.5rem',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
            }}
        >
            <span style={{ 
                fontSize: '0.72rem', 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                letterSpacing: '0.04em', 
                color: 'var(--text-muted)',
                padding: '0 0.5rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                flexShrink: 0
            }}>
                <Compass size={14} color="var(--primary)" />
                Estrategia:
            </span>

            {ESTRATEGIA_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = location.pathname === tab.path || 
                    (tab.path === '/dashboard/estrategia/torre-control' && (location.pathname === '/dashboard/estrategia' || location.pathname === '/dashboard/estrategia/'));
                
                return (
                    <button
                        key={tab.path}
                        type="button"
                        onClick={() => navigate(tab.path)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            height: '32px',
                            padding: '0 0.75rem',
                            borderRadius: '7px',
                            fontSize: '0.78rem',
                            fontWeight: isActive ? 600 : 500,
                            border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                            backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.color = 'var(--text)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--text-muted)';
                            }
                        }}
                    >
                        <Icon size={14} color={isActive ? 'var(--primary)' : 'currentColor'} />
                        <span>{tab.name}</span>
                        {tab.badge && (
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                backgroundColor: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                                color: isActive ? '#fff' : 'var(--text-muted)',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                            }}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
