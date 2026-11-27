import { FLUJOS_MAESTROS_TUTORIALS } from './flujosMaestrosTutorials';
import { OPERACIONES_TUTORIALS } from './operacionesTutorials';
import { BANCOS_TUTORIALS } from './bancosTutorials';

export const TUTORIAL_CATEGORIES = [
    {
        id: 'all',
        label: 'Todos los Tutoriales',
        shortLabel: 'Todos',
        color: '#3b82f6',
        description: 'Catálogo completo de guías paso a paso para operar SIPE Admin con éxito.'
    },
    {
        id: 'flujos',
        label: 'Flujos Maestros (Fin a Fin)',
        shortLabel: 'Flujos Maestros',
        color: '#8b5cf6',
        description: 'Recetas completas de principio a fin que conectan Operaciones y Bancos para garantizar operaciones exitosas.'
    },
    {
        id: 'operaciones',
        label: 'Operaciones y Combustible',
        shortLabel: 'Operaciones',
        color: '#f59e0b',
        description: 'Pedidos de combustible, Portal Puma, autonomía de tanques, recepción RRS, Control de Pagos OCR, Tareas y Energía Solar.'
    },
    {
        id: 'bancos',
        label: 'Bancos y Cheques',
        shortLabel: 'Bancos',
        color: '#10b981',
        description: 'Cuentas bancarias, movimientos y transferencias, conciliación multibanco, cheques normales/contado, diseñador, impresión y reportes.'
    },
    {
        id: 'productividad',
        label: 'Productividad SIPE',
        shortLabel: 'Productividad',
        color: '#06b6d4',
        description: 'Atajos, multi-pestañas, calculadora instantánea Ctrl+K y soporte técnico con captura.'
    }
];

export const ALL_TUTORIALS = [
    ...FLUJOS_MAESTROS_TUTORIALS,
    ...OPERACIONES_TUTORIALS,
    ...BANCOS_TUTORIALS
];

export const DIFFICULTY_STYLES = {
    Esencial: {
        bg: 'rgba(16, 185, 129, 0.14)',
        color: '#10b981',
        border: 'rgba(16, 185, 129, 0.35)'
    },
    Intermedio: {
        bg: 'rgba(245, 158, 11, 0.14)',
        color: '#d97706',
        border: 'rgba(245, 158, 11, 0.35)'
    },
    Avanzado: {
        bg: 'rgba(139, 92, 246, 0.14)',
        color: '#8b5cf6',
        border: 'rgba(139, 92, 246, 0.35)'
    }
};

export function getCategoryMeta(categoryId) {
    return TUTORIAL_CATEGORIES.find((c) => c.id === categoryId) || TUTORIAL_CATEGORIES[0];
}
