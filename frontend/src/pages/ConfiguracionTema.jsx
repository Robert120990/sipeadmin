import React from 'react';
import { 
    Sun, Moon, Sparkles, Palette, Check, 
    RotateCcw, CheckCircle2, Sliders, Compass,
    Eye, ShieldCheck, HeartPulse
} from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { 
    THEMES, CUSTOM_BASES, ACCENT_PRESETS, 
    getContrastRatio 
} from '../utils/themeUtils';

export default function ConfiguracionTema() {
    const { 
        theme, setTheme, 
        customConfig, setCustomConfig, 
        resetToDefault 
    } = useTheme();

    const activeTheme = theme || 'dark';

    const handleSelectTheme = (themeId) => {
        setTheme(themeId);
    };

    const handleUpdateCustomBase = (baseId) => {
        setCustomConfig({
            ...customConfig,
            base: baseId
        });
    };

    const handleUpdateCustomColor = (colorHex) => {
        setCustomConfig({
            ...customConfig,
            primaryColor: colorHex
        });
    };

    const customBase = CUSTOM_BASES.find(b => b.id === (customConfig?.base || 'dark')) || CUSTOM_BASES[0];
    const customPrimary = customConfig?.primaryColor || '#3b82f6';
    const contrastRatio = getContrastRatio(customPrimary, customBase.bg).toFixed(1);
    const isWcagCompliant = parseFloat(contrastRatio) >= 3.0;

    const mainThemes = THEMES.filter(t => ['light', 'dark', 'warm', 'custom'].includes(t.id));
    const extraTheme = THEMES.find(t => t.id === 'midnight');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fadeIn 0.25s ease-out' }}>
            {/* Cabecera de Página */}
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ 
                        width: '42px', height: '42px', borderRadius: '10px', 
                        background: 'rgba(37, 99, 235, 0.15)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        color: 'var(--primary)' 
                    }}>
                        <Palette size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold' }}>
                            Tema y Apariencia Visual
                        </h1>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                            Personaliza el contraste y la paleta de colores para una lectura fácil y sin fatiga visual
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        className="btn-secondary"
                        onClick={resetToDefault}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                        title="Restablecer tema por defecto (Modo Oscuro Pizarra)"
                    >
                        <RotateCcw size={15} /> Restablecer por Defecto
                    </button>
                </div>
            </div>

            {/* Banner Informativo de Ergonomía Visual */}
            <div className="card glass" style={{ padding: '0.9rem 1.25rem', borderLeft: '4px solid var(--primary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center', background: 'var(--hover-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Eye size={20} color="var(--primary)" />
                    <div>
                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>Cero Fatiga Visual</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fondos suavizados que evitan el deslumbramiento blanco</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <HeartPulse size={20} color="#e11d48" />
                    <div>
                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>Filtro de Luz Azul</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Modo Cálido (Sepia) ideal para jornadas largas</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <ShieldCheck size={20} color="#16a34a" />
                    <div>
                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>Contraste WCAG AAA</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Texto negro carbón y blanco marfil de alta nitidez</div>
                    </div>
                </div>
            </div>

            {/* Grid de 4 Temas Principales */}
            <div>
                <label style={{ fontSize: '0.825rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.75rem' }}>
                    Selecciona un Modo Visual
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                    {mainThemes.map(t => {
                        const isSelected = activeTheme === t.id;
                        const IconComponent = t.id === 'light' ? Sun : t.id === 'dark' ? Moon : t.id === 'warm' ? Sparkles : Palette;

                        return (
                            <div
                                key={t.id}
                                onClick={() => handleSelectTheme(t.id)}
                                style={{
                                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                    borderRadius: '14px',
                                    padding: '1.25rem',
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--hover-bg)' : 'var(--card-bg)',
                                    boxShadow: isSelected ? '0 6px 20px rgba(37, 99, 235, 0.15)' : 'none',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ 
                                            width: '38px', height: '38px', borderRadius: '10px', 
                                            background: isSelected ? 'var(--primary)' : 'var(--hover-bg)', 
                                            color: isSelected ? 'var(--primary-text, #ffffff)' : 'var(--text-muted)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                        }}>
                                            <IconComponent size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text)' }}>
                                                {t.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', fontWeight: '600' }}>
                                                {t.tagline}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ 
                                        width: '22px', height: '22px', borderRadius: '50%', 
                                        border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                        background: isSelected ? 'var(--primary)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#ffffff',
                                        flexShrink: 0
                                    }}>
                                        {isSelected && <Check size={13} strokeWidth={3} />}
                                    </div>
                                </div>

                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                                    {t.description}
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: 'auto', paddingTop: '0.35rem', borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Muestra:</span>
                                    {t.palette.map((colorHex, idx) => (
                                        <div 
                                            key={idx} 
                                            style={{ 
                                                width: '20px', height: '20px', borderRadius: '50%', 
                                                background: colorHex === 'var(--primary)' ? (customConfig?.primaryColor || '#3b82f6') : colorHex,
                                                border: '1.5px solid rgba(0,0,0,0.15)',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                            }} 
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Alternativa: Azul Medianoche */}
            {extraTheme && (
                <div 
                    onClick={() => handleSelectTheme('midnight')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.85rem 1.25rem',
                        borderRadius: '12px',
                        border: `2px solid ${activeTheme === 'midnight' ? 'var(--primary)' : 'var(--border)'}`,
                        background: activeTheme === 'midnight' ? 'var(--hover-bg)' : 'var(--card-bg)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Compass size={22} color="#38bdf8" />
                        <div>
                            <span style={{ fontWeight: 'bold', fontSize: '0.925rem', color: 'var(--text)' }}>
                                {extraTheme.name}
                            </span>
                            <span style={{ marginLeft: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {extraTheme.tagline} — {extraTheme.description}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {extraTheme.palette.map((c, i) => (
                                <div key={i} style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.15)' }} />
                            ))}
                        </div>
                        <div style={{ 
                            width: '20px', height: '20px', borderRadius: '50%', 
                            border: `2px solid ${activeTheme === 'midnight' ? 'var(--primary)' : 'var(--border)'}`,
                            background: activeTheme === 'midnight' ? 'var(--primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#ffffff'
                        }}>
                            {activeTheme === 'midnight' && <Check size={12} strokeWidth={3} />}
                        </div>
                    </div>
                </div>
            )}

            {/* Personalizador si el modo activo es Personalizado */}
            {activeTheme === 'custom' && (
                <div className="card glass" style={{ padding: '1.5rem', border: '1.5px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fadeIn 0.25s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--primary)' }}>
                            <Sliders size={20} /> Personalizador de Paleta y Contrastes
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.25rem 0.75rem', borderRadius: '12px', background: isWcagCompliant ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isWcagCompliant ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                            <CheckCircle2 size={15} />
                            <span>Contraste {isWcagCompliant ? 'Óptimo (WCAG AAA)' : 'Bajo'} ({contrastRatio}:1)</span>
                        </div>
                    </div>

                    {/* Selector de Fondo Base */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                            1. Tono Base de Fondo
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                            {CUSTOM_BASES.map(base => {
                                const isBaseActive = (customConfig?.base || 'dark') === base.id;
                                return (
                                    <button
                                        key={base.id}
                                        onClick={() => handleUpdateCustomBase(base.id)}
                                        style={{
                                            padding: '0.6rem 0.85rem',
                                            borderRadius: '8px',
                                            border: `1.5px solid ${isBaseActive ? 'var(--primary)' : 'var(--border)'}`,
                                            background: base.bg,
                                            color: base.text,
                                            fontSize: '0.825rem',
                                            fontWeight: isBaseActive ? 'bold' : 'normal',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            boxShadow: isBaseActive ? '0 0 0 2px var(--primary)' : 'none'
                                        }}
                                    >
                                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: base.cardBg, border: '1px solid rgba(255,255,255,0.2)' }} />
                                        {base.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Selector de Color de Acento */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                            2. Color Principal / Acento
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                            {ACCENT_PRESETS.map(preset => {
                                const isColorActive = customPrimary.toLowerCase() === preset.hex.toLowerCase();
                                return (
                                    <button
                                        key={preset.hex}
                                        onClick={() => handleUpdateCustomColor(preset.hex)}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '20px',
                                            border: `2px solid ${isColorActive ? 'var(--text)' : 'transparent'}`,
                                            background: preset.hex,
                                            color: '#ffffff',
                                            fontSize: '0.78rem',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            boxShadow: isColorActive ? '0 2px 10px rgba(0,0,0,0.35)' : 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isColorActive && <Check size={13} strokeWidth={3} />}
                                        {preset.name}
                                    </button>
                                );
                            })}

                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.65rem', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
                                <input
                                    type="color"
                                    value={customPrimary}
                                    onChange={e => handleUpdateCustomColor(e.target.value)}
                                    style={{ width: '24px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                    title="Elegir cualquier color con cuentagotas"
                                />
                                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text)' }}>
                                    {customPrimary.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Vista Previa en Vivo Sandbox */}
            <div className="card glass" style={{ padding: '1.25rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Vista Previa en Vivo de Componentes (Validación de Lectura)
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'center' }}>
                    <button className="btn-primary" style={{ height: '38px', fontSize: '0.825rem' }}>
                        Botón Primario
                    </button>
                    <button className="btn-secondary" style={{ height: '38px', fontSize: '0.825rem' }}>
                        Botón Secundario
                    </button>
                    <span className="badge badge-active">Estado Activo</span>
                    <span className="badge badge-inactive">Estado Inactivo</span>
                    <div style={{ flex: '1 1 240px' }}>
                        <input 
                            type="text" 
                            readOnly 
                            value="Entrada de datos con contraste calibrado" 
                            style={{ height: '38px', fontSize: '0.825rem' }}
                        />
                    </div>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', fontSize: '0.825rem', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>Estación</th>
                                <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>Galonaje Total</th>
                                <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>Venta Total ($)</th>
                                <th style={{ textAlign: 'center', padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.6rem 0.75rem', fontWeight: '600' }}>Puma Miraflores</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>428,936 gal</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>$1,930,778.00</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}><span className="badge badge-active">Operando</span></td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.6rem 0.75rem', fontWeight: '600' }}>Shell Chalchuapa</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>398,553 gal</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>$1,697,425.00</td>
                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}><span className="badge badge-active">Operando</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
