// Utility functions, constants and color math for theme system

export function hexToRgb(hex) {
    if (!hex) return { r: 37, g: 99, b: 235 };
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    if (isNaN(num)) return { r: 37, g: 99, b: 235 };
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

export function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(hex1, hex2) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    const l1 = getLuminance(c1.r, c1.g, c1.b);
    const l2 = getLuminance(c2.r, c2.g, c2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return ((lighter + 0.05) / (darker + 0.05));
}

export function adjustBrightness(hex, percent) {
    const rgb = hexToRgb(hex);
    const amount = Math.round(2.55 * percent);
    const r = Math.min(255, Math.max(0, rgb.r + amount));
    const g = Math.min(255, Math.max(0, rgb.g + amount));
    const b = Math.min(255, Math.max(0, rgb.b + amount));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const THEMES = [
    {
        id: 'light',
        name: 'Modo Claro',
        tagline: 'Luz Diurna & Alto Contraste',
        description: 'Fondo suave (#f8fafc) que elimina el deslumbramiento, texto carbón nítido (#0f172a) y bordes definidos. Ideal para oficinas y luz natural.',
        icon: 'Sun',
        palette: ['#f8fafc', '#ffffff', '#0f172a', '#2563eb'],
        isDark: false
    },
    {
        id: 'dark',
        name: 'Modo Oscuro',
        tagline: 'Pizarra Noche & Descanso Visual',
        description: 'Fondo pizarra azulada (#0f172a) con tarjetas grafito y tipografía suave (#f8fafc). Descanso visual supremo sin fatiga ni reflejos.',
        icon: 'Moon',
        palette: ['#0f172a', '#1e293b', '#f8fafc', '#3b82f6'],
        isDark: true
    },
    {
        id: 'warm',
        name: 'Lectura Cálida (Sepia)',
        tagline: 'Anti-Fatiga & Filtro Luz Azul',
        description: 'Inspirado en e-readers y papel natural (#fbf7ee). Filtra la luz azul y protege la vista en jornadas extensas de análisis financiero.',
        icon: 'Sparkles',
        palette: ['#fbf7ee', '#fffdf8', '#292524', '#c2410c'],
        isDark: false
    },
    {
        id: 'midnight',
        name: 'Azul Medianoche',
        tagline: 'Cobalto Profundo & Claridad Ejecutiva',
        description: 'Fondo abisal marino (#060e1a) con acentos cian zafiro (#38bdf8). Máxima sofisticación con un ratio de contraste superior.',
        icon: 'Compass',
        palette: ['#060e1a', '#0d1b2e', '#f0f6fc', '#38bdf8'],
        isDark: true
    },
    {
        id: 'custom',
        name: 'Personalizado por Colores',
        tagline: 'Tu Paleta & Acento a Medida',
        description: 'Configura tu propio entorno. Elige tu tono base (Oscuro, Claro, Medianoche u OLED) y tu color de acento con cálculo dinámico de contraste WCAG.',
        icon: 'Palette',
        palette: ['#1e293b', '#3b82f6', '#f8fafc', '#10b981'],
        isCustom: true
    }
];

export const CUSTOM_BASES = [
    {
        id: 'dark',
        name: 'Pizarra Oscura',
        bg: '#0f172a',
        cardBg: '#1e293b',
        text: '#f8fafc',
        textMuted: '#94a3b8',
        border: '#334155',
        isDark: true
    },
    {
        id: 'light',
        name: 'Luz Suave',
        bg: '#f8fafc',
        cardBg: '#ffffff',
        text: '#0f172a',
        textMuted: '#475569',
        border: '#cbd5e1',
        isDark: false
    },
    {
        id: 'midnight',
        name: 'Medianoche',
        bg: '#060e1a',
        cardBg: '#0d1b2e',
        text: '#f0f6fc',
        textMuted: '#8da2c0',
        border: '#1e3557',
        isDark: true
    },
    {
        id: 'oled',
        name: 'Negro OLED',
        bg: '#000000',
        cardBg: '#121212',
        text: '#f8fafc',
        textMuted: '#a1a1aa',
        border: '#27272a',
        isDark: true
    }
];

export const ACCENT_PRESETS = [
    { name: 'Azul SIPE', hex: '#2563eb' },
    { name: 'Esmeralda', hex: '#059669' },
    { name: 'Violeta Real', hex: '#7c3aed' },
    { name: 'Ámbar Solar', hex: '#d97706' },
    { name: 'Rubí / Carmín', hex: '#e11d48' },
    { name: 'Cian Neón', hex: '#0891b2' },
    { name: 'Índigo', hex: '#4f46e5' },
    { name: 'Naranja Fuego', hex: '#ea580c' },
    { name: 'Verde Menta', hex: '#10b981' },
    { name: 'Fucsia Neón', hex: '#d946ef' }
];

export const DEFAULT_CUSTOM_CONFIG = {
    base: 'dark',
    primaryColor: '#3b82f6'
};

const CUSTOM_CSS_PROPS = [
    '--primary',
    '--primary-hover',
    '--primary-text',
    '--bg',
    '--card-bg',
    '--text',
    '--text-muted',
    '--border',
    '--glass-bg',
    '--hover-bg',
    '--modal-border',
    '--bg-color',
    '--border-color',
    '--bg-card',
    '--bg-secondary'
];

export function applyCustomThemeCSS(customConfig) {
    const config = { ...DEFAULT_CUSTOM_CONFIG, ...(customConfig || {}) };
    const baseDef = CUSTOM_BASES.find(b => b.id === config.base) || CUSTOM_BASES[0];
    const primary = config.primaryColor || '#3b82f6';
    const primaryHover = baseDef.isDark ? adjustBrightness(primary, 15) : adjustBrightness(primary, -15);
    const whiteContrast = getContrastRatio(primary, '#ffffff');
    const primaryText = whiteContrast >= 4.5 ? '#ffffff' : '#0f172a';

    const rgbPrimary = hexToRgb(primary);
    const hoverBg = `rgba(${rgbPrimary.r}, ${rgbPrimary.g}, ${rgbPrimary.b}, ${baseDef.isDark ? '0.12' : '0.08'})`;
    const modalBorder = `rgba(${rgbPrimary.r}, ${rgbPrimary.g}, ${rgbPrimary.b}, 0.22)`;
    const glassBg = baseDef.isDark 
        ? `rgba(${hexToRgb(baseDef.cardBg).r}, ${hexToRgb(baseDef.cardBg).g}, ${hexToRgb(baseDef.cardBg).b}, 0.85)`
        : `rgba(${hexToRgb(baseDef.cardBg).r}, ${hexToRgb(baseDef.cardBg).g}, ${hexToRgb(baseDef.cardBg).b}, 0.92)`;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--primary', primary);
    rootStyle.setProperty('--primary-hover', primaryHover);
    rootStyle.setProperty('--primary-text', primaryText);
    rootStyle.setProperty('--bg', baseDef.bg);
    rootStyle.setProperty('--card-bg', baseDef.cardBg);
    rootStyle.setProperty('--text', baseDef.text);
    rootStyle.setProperty('--text-muted', baseDef.textMuted);
    rootStyle.setProperty('--border', baseDef.border);
    rootStyle.setProperty('--glass-bg', glassBg);
    rootStyle.setProperty('--hover-bg', hoverBg);
    rootStyle.setProperty('--modal-border', modalBorder);
    rootStyle.setProperty('--bg-color', baseDef.bg);
    rootStyle.setProperty('--border-color', baseDef.border);
    rootStyle.setProperty('--bg-card', baseDef.cardBg);
    rootStyle.setProperty('--bg-secondary', baseDef.bg);
    rootStyle.setProperty('color-scheme', baseDef.isDark ? 'dark' : 'light');
}

export function clearCustomThemeCSS() {
    const rootStyle = document.documentElement.style;
    CUSTOM_CSS_PROPS.forEach(prop => {
        rootStyle.removeProperty(prop);
    });
    rootStyle.removeProperty('color-scheme');
}
