import React from 'react';
import { 
    Sun, Moon, Sparkles, Palette, Check, 
    Compass, RotateCcw, CheckCircle2, Sliders 
} from 'lucide-react';
import Modal from './Modal';
import { useTheme } from './ThemeProvider';
import { 
    THEMES, CUSTOM_BASES, ACCENT_PRESETS, 
    getContrastRatio, hexToRgb 
} from '../utils/themeUtils';

export default function ThemeModal({ isOpen, onClose }) {
    const { 
        theme, setTheme, 
        customConfig, setCustomConfig, 
        isThemeModalOpen, closeThemeModal,
        resetToDefault
    } = useTheme();

    const openState = isOpen !== undefined ? isOpen : isThemeModalOpen;
    const handleClose = onClose || closeThemeModal;

    const activeTheme = theme || 'dark';

    // Manejador de selección de tema
    const handleSelectTheme = (themeId) => {
        setTheme(themeId);
    };

    // Manejador de configuración personalizada
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

    // Cálculo de contraste actual para el modo personalizado
    const customBase = CUSTOM_BASES.find(b => b.id === (customConfig?.base || 'dark')) || CUSTOM_BASES[0];
    const customPrimary = customConfig?.primaryColor || '#3b82f6';
    const contrastRatio = getContrastRatio(customPrimary, customBase.bg).toFixed(1);
    const isWcagCompliant = parseFloat(contrastRatio) >= 3.0;

    // 4 Modos Principales solicitados por el usuario
    const mainThemes = THEMES.filter(t => ['light', 'dark', 'warm', 'custom'].includes(t.id));
    const extraTheme = THEMES.find(t => t.id === 'midnight');

    return (
        <Modal
            open={openState}
            onClose={handleClose}
            size="lg"
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ 
                        width: '36px', height: '36px', borderRadius: '10px', 
                        background: 'rgba(37, 99, 235, 0.15)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        color: 'var(--primary)' 
                    }}>
                        <Palette size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
                            Configuración de Tema y Apariencia
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Modos visuales ergonómicos con alto contraste para lectura prolongada sin fatiga
                        </p>
                    </div>
                </div>
            }
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                        className="btn-secondary"
                        onClick={resetToDefault}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.8rem' }}
                        title="Restablecer tema por defecto (Modo Oscuro Pizarra)"
                    >
                        <RotateCcw size={14} /> Restablecer por Defecto
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleClose}
                        style={{ height: '36px', padding: '0 1.5rem', fontSize: '0.825rem', fontWeight: '600' }}
                    >
                        Listo
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
                {/* 4 Temas Principales en Grid Ergonómica */}
                <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.65rem' }}>
                        Selecciona un Modo Visual (4 Opciones Optimizadas)
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                        {mainThemes.map(t => {
                            const isSelected = activeTheme === t.id;
                            const IconComponent = t.id === 'light' ? Sun : t.id === 'dark' ? Moon : t.id === 'warm' ? Sparkles : Palette;

                            return (
                                <div
                                    key={t.id}
                                    onClick={() => handleSelectTheme(t.id)}
                                    style={{
                                        border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        cursor: 'pointer',
                                        background: isSelected ? 'var(--hover-bg)' : 'var(--card-bg)',
                                        boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.15)' : 'none',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        position: 'relative'
                                    }}
                                >
                                    {/* Indicador de selección */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{ 
                                                width: '32px', height: '32px', borderRadius: '8px', 
                                                background: isSelected ? 'var(--primary)' : 'var(--hover-bg)', 
                                                color: isSelected ? 'var(--primary-text, #ffffff)' : 'var(--text-muted)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                            }}>
                                                <IconComponent size={18} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.925rem', color: 'var(--text)' }}>
                                                    {t.name}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', fontWeight: '500' }}>
                                                    {t.tagline}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ 
                                            width: '20px', height: '20px', borderRadius: '50%', 
                                            border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                            background: isSelected ? 'var(--primary)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#ffffff',
                                            flexShrink: 0
                                        }}>
                                            {isSelected && <Check size={12} strokeWidth={3} />}
                                        </div>
                                    </div>

                                    {/* Descripción ergonómica */}
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                        {t.description}
                                    </p>

                                    {/* Muestra de Paleta de Colores */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Paleta:</span>
                                        {t.palette.map((colorHex, idx) => (
                                            <div 
                                                key={idx} 
                                                style={{ 
                                                    width: '18px', height: '18px', borderRadius: '50%', 
                                                    background: colorHex === 'var(--primary)' ? (customConfig?.primaryColor || '#3b82f6') : colorHex,
                                                    border: '1px solid rgba(0,0,0,0.15)',
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

                {/* Opción adicional: Azul Medianoche */}
                {extraTheme && (
                    <div 
                        onClick={() => handleSelectTheme('midnight')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            border: `1.5px solid ${activeTheme === 'midnight' ? 'var(--primary)' : 'var(--border)'}`,
                            background: activeTheme === 'midnight' ? 'var(--hover-bg)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <Compass size={18} color="#38bdf8" />
                            <div>
                                <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text)' }}>
                                    {extraTheme.name}
                                </span>
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {extraTheme.tagline}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                {extraTheme.palette.map((c, i) => (
                                    <div key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                                ))}
                            </div>
                            <div style={{ 
                                width: '18px', height: '18px', borderRadius: '50%', 
                                border: `2px solid ${activeTheme === 'midnight' ? 'var(--primary)' : 'var(--border)'}`,
                                background: activeTheme === 'midnight' ? 'var(--primary)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                {activeTheme === 'midnight' && <Check size={11} strokeWidth={3} />}
                            </div>
                        </div>
                    </div>
                )}

                {/* Sección Desplegable para el Modo Personalizado por Colores */}
                {activeTheme === 'custom' && (
                    <div className="card glass" style={{ padding: '1.25rem', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.25s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 'bold', fontSize: '0.925rem', color: 'var(--primary)' }}>
                                <Sliders size={18} /> Personalizador de Paleta y Contrastes
                            </div>

                            {/* Badge de Contraste WCAG */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: isWcagCompliant ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isWcagCompliant ? '#22c55e' : '#ef4444' }}>
                                <CheckCircle2 size={13} />
                                <span>Contraste {isWcagCompliant ? 'Óptimo (WCAG)' : 'Bajo'} ({contrastRatio}:1)</span>
                            </div>
                        </div>

                        {/* 1. Selector de Fondo Base */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.45rem' }}>
                                1. Tono Base de Fondo
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                                {CUSTOM_BASES.map(base => {
                                    const isBaseActive = (customConfig?.base || 'dark') === base.id;
                                    return (
                                        <button
                                            key={base.id}
                                            onClick={() => handleUpdateCustomBase(base.id)}
                                            style={{
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '8px',
                                                border: `1.5px solid ${isBaseActive ? 'var(--primary)' : 'var(--border)'}`,
                                                background: base.bg,
                                                color: base.text,
                                                fontSize: '0.8rem',
                                                fontWeight: isBaseActive ? 'bold' : 'normal',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.4rem',
                                                boxShadow: isBaseActive ? '0 0 0 2px var(--primary)' : 'none'
                                            }}
                                        >
                                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: base.cardBg, border: '1px solid rgba(255,255,255,0.2)' }} />
                                            {base.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Selector de Color de Acento */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.45rem' }}>
                                2. Color Principal / Acento
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                {ACCENT_PRESETS.map(preset => {
                                    const isColorActive = customPrimary.toLowerCase() === preset.hex.toLowerCase();
                                    return (
                                        <button
                                            key={preset.hex}
                                            onClick={() => handleUpdateCustomColor(preset.hex)}
                                            style={{
                                                padding: '0.35rem 0.75rem',
                                                borderRadius: '20px',
                                                border: `1.5px solid ${isColorActive ? 'var(--text)' : 'transparent'}`,
                                                background: preset.hex,
                                                color: '#ffffff',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                boxShadow: isColorActive ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                                                cursor: 'pointer'
                                            }}
                                            title={preset.name}
                                        >
                                            {isColorActive && <Check size={12} strokeWidth={3} />}
                                            {preset.name}
                                        </button>
                                    );
                                })}

                                {/* Selector HTML5 Color Picker Libre */}
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
                                    <input
                                        type="color"
                                        value={customPrimary}
                                        onChange={e => handleUpdateCustomColor(e.target.value)}
                                        style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                        title="Elegir cualquier color con cuentagotas"
                                    />
                                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text)' }}>
                                        {customPrimary.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Vista Previa en Vivo (Live Preview Sandbox) */}
                <div className="card glass" style={{ padding: '1rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Vista Previa en Vivo de Componentes (Legibilidad en Tiempo Real)
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                        <button className="btn-primary" style={{ height: '36px', fontSize: '0.8rem' }}>
                            Botón Primario
                        </button>
                        <button className="btn-secondary" style={{ height: '36px', fontSize: '0.8rem' }}>
                            Botón Secundario
                        </button>
                        <span className="badge badge-active">Estado Activo</span>
                        <span className="badge badge-inactive">Inactivo</span>
                        <div style={{ flex: '1 1 200px' }}>
                            <input 
                                type="text" 
                                readOnly 
                                value="Campo de entrada de texto editable" 
                                style={{ height: '36px', fontSize: '0.8rem' }}
                            />
                        </div>
                    </div>

                    {/* Muestra de fila de datos */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem' }}>
                        <div>
                            <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>Puma Miraflores: </span>
                            <span style={{ color: 'var(--text-muted)' }}>428,936 galones despachados</span>
                        </div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                            $1,930,778.00
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
