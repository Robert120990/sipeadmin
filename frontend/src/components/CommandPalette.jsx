import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Search, CornerDownLeft, ArrowRight, X, Calculator, Copy, Check,
    Ticket, Camera, FileText
} from 'lucide-react';
import { evaluateSafeMath } from '../utils/calculatorUtils';
import { useTickets } from '../context/TicketContext';
import { useToast } from './Toast';

const TICKET_KEYWORDS = [
    'ticket', 'tickets', 'soporte', 'error', 'falla', 'bug',
    'problema', 'requerimiento', 'mejora', 'ayuda', 'captura'
];

const CommandPalette = ({ isOpen, onClose, navItems = [], onSelectItem }) => {
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [copiedValue, setCopiedValue] = useState(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const { openQuickTicket } = useTickets();
    const { addToast } = useToast();

    const calcResult = useMemo(() => evaluateSafeMath(search), [search]);

    const showTicketAction = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return TICKET_KEYWORDS.some((kw) => kw.includes(q) || q.includes(kw));
    }, [search]);

    const filteredItems = useMemo(() => {
        const baseList = [];

        if (showTicketAction) {
            const q = search.trim();
            const cleanSubject = TICKET_KEYWORDS.includes(q.toLowerCase()) ? '' : q;
            baseList.push({
                id: '__quick_ticket__',
                name: 'Nuevo Ticket de Soporte / Requerimiento (con captura WebP)',
                category: 'Soporte Técnico Rápido · sys.sipesv.com',
                path: '#quick-ticket',
                isQuickAction: true,
                prefillSubject: cleanSubject
            });
        }

        if (!search.trim()) {
            return [...baseList, ...navItems];
        }

        const q = search.toLowerCase().trim();
        const matched = navItems.filter(
            (item) =>
                item.name.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q) ||
                (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q)))
        );

        return [...baseList, ...matched];
    }, [search, navItems, showTicketAction]);

    const copyCalculatorValue = async (val, label = 'Resultado') => {
        if (val === null || val === undefined) return;
        const cleanText = String(val).replace(/,/g, '');
        try {
            await navigator.clipboard.writeText(cleanText);
            setCopiedValue(label);
            addToast(`${label} copiado: ${val}`, 'success', 2000);
            setTimeout(() => setCopiedValue(null), 1800);
        } catch {
            addToast('No se pudo copiar al portapapeles', 'error');
        }
    };

    const triggerQuickTicketFromPalette = (prefillSubject = '') => {
        onClose();
        setTimeout(() => {
            openQuickTicket({
                autoCapture: true,
                subject: prefillSubject || ''
            });
        }, 120);
    };

    const executeItem = (item) => {
        if (!item) return;
        if (item.isQuickAction) {
            triggerQuickTicketFromPalette(item.prefillSubject);
            return;
        }
        if (onSelectItem) {
            onSelectItem(item);
        }
        onClose();
    };

    // Global shortcut Ctrl + K / Cmd + K
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (isOpen) {
                    onClose();
                } else {
                    window.dispatchEvent(new CustomEvent('toggle-command-palette'));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 40);
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);

    const handleKeyDownInput = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (calcResult && (filteredItems.length === 0 || (filteredItems.length === 1 && filteredItems[0].isQuickAction))) {
                copyCalculatorValue(calcResult.formatted, 'Resultado');
                return;
            }
            if (filteredItems[selectedIndex]) {
                executeItem(filteredItems[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    useEffect(() => {
        if (listRef.current && filteredItems.length > 0) {
            const activeEl = listRef.current.children[selectedIndex];
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex, filteredItems.length]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9998,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '10vh',
                paddingLeft: '1rem',
                paddingRight: '1rem',
                background: 'rgba(2, 6, 23, 0.65)',
                backdropFilter: 'blur(4px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '620px',
                    background: 'var(--card-bg)',
                    color: 'var(--text)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid var(--border)',
                        gap: '0.65rem'
                    }}
                >
                    {calcResult ? (
                        <Calculator size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                    ) : (
                        <Search size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                    )}
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDownInput}
                        placeholder="Buscar pantalla, calcular (ej. 1250*1.13) o escribe 'ticket'..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text)',
                            fontSize: '0.92rem',
                            fontWeight: 500
                        }}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '0.2rem'
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                    <div
                        style={{
                            padding: '0.15rem 0.45rem',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px'
                        }}
                    >
                        ESC
                    </div>
                </div>

                {/* Calculator Widget */}
                {calcResult && (
                    <div style={{ padding: '0.75rem 1rem 0.25rem 1rem' }}>
                        <div
                            style={{
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
                                color: '#fff',
                                padding: '0.85rem 1rem',
                                border: '1px solid rgba(99, 102, 241, 0.35)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#a5b4fc' }}>
                                        <Calculator size={12} /> Calculadora Instantánea
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                                        {calcResult.expression} =
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em', marginTop: '0.1rem' }}>
                                        {calcResult.formatted}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => copyCalculatorValue(calcResult.formatted, 'Resultado')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        padding: '0.45rem 0.8rem',
                                        borderRadius: '8px',
                                        background: '#4f46e5',
                                        color: '#fff',
                                        border: 'none',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {copiedValue === 'Resultado' ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{copiedValue === 'Resultado' ? 'Copiado' : 'Copiar'}</span>
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.4rem', marginTop: '0.65rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <button
                                    type="button"
                                    onClick={() => copyCalculatorValue(calcResult.commercial.plusIva, 'Total + IVA')}
                                    style={{ textAlign: 'left', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer' }}
                                >
                                    <span style={{ display: 'block', fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>+ IVA 13%</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6ee7b7', fontFamily: 'monospace' }}>${calcResult.commercial.plusIva}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyCalculatorValue(calcResult.commercial.iva13, 'IVA 13%')}
                                    style={{ textAlign: 'left', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer' }}
                                >
                                    <span style={{ display: 'block', fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>IVA (13%)</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c7d2fe', fontFamily: 'monospace' }}>${calcResult.commercial.iva13}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyCalculatorValue(calcResult.commercial.netFromIncluded, 'Neto sin IVA')}
                                    style={{ textAlign: 'left', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer' }}
                                >
                                    <span style={{ display: 'block', fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Neto (sin IVA)</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fde68a', fontFamily: 'monospace' }}>${calcResult.commercial.netFromIncluded}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyCalculatorValue(calcResult.commercial.ivaFromIncluded, 'IVA incluido')}
                                    style={{ textAlign: 'left', padding: '0.35rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer' }}
                                >
                                    <span style={{ display: 'block', fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>IVA Desglosado</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>${calcResult.commercial.ivaFromIncluded}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results List */}
                <div
                    ref={listRef}
                    style={{
                        maxHeight: '52vh',
                        overflowY: 'auto',
                        padding: '0.5rem'
                    }}
                >
                    {filteredItems.length === 0 ? (
                        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {!calcResult && (
                                <p style={{ fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>
                                    No se encontraron pantallas que coincidan con &ldquo;{search}&rdquo;
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => triggerQuickTicketFromPalette(search)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    padding: '0.5rem 0.95rem',
                                    borderRadius: '10px',
                                    background: 'rgba(79, 70, 229, 0.12)',
                                    color: 'var(--primary)',
                                    border: '1px solid rgba(79, 70, 229, 0.3)',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <Camera size={14} />
                                <span>Reportar Ticket con Captura: &ldquo;{search}&rdquo;</span>
                            </button>
                        </div>
                    ) : (
                        filteredItems.map((item, index) => {
                            const Icon = item.icon || FileText;
                            const isSelected = index === selectedIndex;

                            if (item.isQuickAction) {
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => executeItem(item)}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.65rem 0.85rem',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            marginBottom: '0.35rem',
                                            background: isSelected ? '#4f46e5' : 'rgba(79, 70, 229, 0.1)',
                                            color: isSelected ? '#fff' : 'var(--text)',
                                            border: isSelected ? '1px solid #4f46e5' : '1px solid rgba(79, 70, 229, 0.25)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                            <div
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '8px',
                                                    background: isSelected ? 'rgba(255,255,255,0.2)' : '#4f46e5',
                                                    color: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <Ticket size={17} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{item.name}</div>
                                                <div style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 600 }}>
                                                    {item.category} · Toma captura automática en WebP
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700 }}>
                                            <Camera size={13} /> Capturar
                                        </span>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={item.path}
                                    onClick={() => executeItem(item)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.55rem 0.85rem',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        background: isSelected ? 'var(--primary)' : 'transparent',
                                        color: isSelected ? '#fff' : 'var(--text)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                        <div
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '8px',
                                                background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Icon size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{item.name}</div>
                                            <div style={{ fontSize: '0.68rem', opacity: isSelected ? 0.85 : 0.65, textTransform: 'uppercase', fontWeight: 600 }}>
                                                {item.category}
                                            </div>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 600 }}>
                                            <span>Ir</span>
                                            <CornerDownLeft size={14} />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '0.55rem 1rem',
                        background: 'var(--bg)',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)'
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                        <span><strong>↑↓</strong> navegar</span>
                        <span><strong>↵</strong> abrir</span>
                        <span><strong>100+13%</strong> calcular</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>escribe &ldquo;ticket&rdquo; para soporte</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 700 }}>
                        <span>SIPE Command</span>
                        <ArrowRight size={12} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
