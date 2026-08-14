import React, { useEffect } from 'react';

/**
 * Hook de atajos de teclado para el diseñador.
 * Ctrl+C (copiar), Ctrl+V (pegar), Ctrl+Z (deshacer), Ctrl+Y (rehacer), Delete (eliminar).
 */
const useKeyboard = ({ onCopy, onPaste, onUndo, onRedo, onDelete, enabled }) => {
    useEffect(() => {
        if (!enabled) return;

        const handler = (e) => {
            const target = e.target;
            // No interceptar atajos mientras se edita un input/textarea/select
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;

            const ctrl = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (ctrl && key === 'z') {
                e.preventDefault();
                if (e.shiftKey) onRedo();
                else onUndo();
            } else if (ctrl && key === 'y') {
                e.preventDefault();
                onRedo();
            } else if (ctrl && key === 'c') {
                e.preventDefault();
                onCopy();
            } else if (ctrl && key === 'v') {
                e.preventDefault();
                onPaste();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
                e.preventDefault();
                onDelete();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCopy, onPaste, onUndo, onRedo, onDelete, enabled]);
};

export default useKeyboard;
