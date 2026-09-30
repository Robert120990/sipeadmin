import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
    DEFAULT_CUSTOM_CONFIG, 
    applyCustomThemeCSS, 
    clearCustomThemeCSS 
} from '../utils/themeUtils';
import ThemeModal from './ThemeModal';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    // 1. Estado de Tema (dark, light, warm, midnight, custom)
    const [theme, setThemeState] = useState(() => {
        return localStorage.getItem('theme') || 'dark';
    });

    // 2. Estado de Configuración Personalizada
    const [customConfig, setCustomConfigState] = useState(() => {
        try {
            const saved = localStorage.getItem('sipe_custom_theme');
            return saved ? JSON.parse(saved) : DEFAULT_CUSTOM_CONFIG;
        } catch {
            return DEFAULT_CUSTOM_CONFIG;
        }
    });

    // 3. Estado del Modal de Configuración
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

    // Aplicación del tema y persistencia
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        if (theme === 'custom') {
            applyCustomThemeCSS(customConfig);
        } else {
            clearCustomThemeCSS();
        }
    }, [theme, customConfig]);

    const setTheme = useCallback((newTheme) => {
        setThemeState(newTheme);
    }, []);

    const setCustomConfig = useCallback((newConfig) => {
        setCustomConfigState(newConfig);
        try {
            localStorage.setItem('sipe_custom_theme', JSON.stringify(newConfig));
        } catch {
            // Manejo silencioso de cuota de localStorage
        }
    }, []);

    const openThemeModal = useCallback(() => {
        setIsThemeModalOpen(true);
    }, []);

    const closeThemeModal = useCallback(() => {
        setIsThemeModalOpen(false);
    }, []);

    const toggleTheme = useCallback(() => {
        // Cicla entre los temas principales ergonómicos
        setThemeState(prev => {
            if (prev === 'dark') return 'light';
            if (prev === 'light') return 'warm';
            if (prev === 'warm') return 'custom';
            return 'dark';
        });
    }, []);

    const resetToDefault = useCallback(() => {
        setThemeState('dark');
        setCustomConfigState(DEFAULT_CUSTOM_CONFIG);
        try {
            localStorage.setItem('theme', 'dark');
            localStorage.setItem('sipe_custom_theme', JSON.stringify(DEFAULT_CUSTOM_CONFIG));
        } catch {
            // Manejo silencioso
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ 
            theme, 
            setTheme, 
            customConfig, 
            setCustomConfig,
            isThemeModalOpen,
            openThemeModal,
            closeThemeModal,
            toggleTheme,
            resetToDefault
        }}>
            {children}
            <ThemeModal isOpen={isThemeModalOpen} onClose={closeThemeModal} />
        </ThemeContext.Provider>
    );
};
