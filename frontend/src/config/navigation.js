import { LayoutDashboard, Users, Shield, Settings as SettingsIcon, Truck, Container, FileText, BarChart3, Droplets, ClipboardList, DollarSign, Landmark, Database, Mail, CreditCard, HardDrive, Scale, Calculator, TrendingUp, Wrench, Sparkles, Printer } from 'lucide-react';

export const mainNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
];

export const catalogItems = [
    { name: 'Transportistas', path: '/dashboard/carriers', icon: Truck },
    { name: 'Pipas', path: '/dashboard/tankers', icon: Container },
];

export const consultasItemsRoot = [];

export const consultasEstaciones = [
    { name: 'Resumen de Ventas', path: '/dashboard/consultas/estaciones/ventas', icon: FileText },
    { name: 'Venta de Lubricantes', path: '/dashboard/consultas/estaciones/lubricantes', icon: Droplets },
    { name: 'Resumen de Cierre', path: '/dashboard/consultas/estaciones/resumen-cierre', icon: ClipboardList },
    { name: 'Diferencias Combustible', path: '/dashboard/consultas/estaciones/diferencias-combustible', icon: BarChart3 },
    { name: 'Precios Estación', path: '/dashboard/consultas/estaciones/precios', icon: DollarSign },
    { name: 'Precios Competencia', path: '/dashboard/consultas/estaciones/precios-competencia', icon: BarChart3 }
];

export const operacionesMenu = [
    {
        name: 'Pedidos Combustible',
        path: '/dashboard/operaciones/pedidos',
        icon: Truck
    },
    {
        name: 'Control de Pagos',
        path: '/dashboard/operaciones/recordatorios',
        icon: FileText
    }
];
export const bancosMenu = [
    { name: 'Cuentas Bancarias', path: '/dashboard/bancos/cuentas', icon: Landmark },
    { name: 'Movimientos Bancarios', path: '/dashboard/bancos/movimientos', icon: FileText },
    { name: 'Conciliación Bancaria', path: '/dashboard/bancos/conciliacion', icon: Scale },
    { name: 'Cheques', path: '/dashboard/bancos/cheques', icon: DollarSign },
    { name: 'Cheques Contado', path: '/dashboard/bancos/cheques-contado', icon: CreditCard },
    { name: 'Diseñador de Cheques', path: '/dashboard/bancos/check-designer', icon: FileText },
];

export const bancosReportes = [
    { name: 'Saldos en Bancos', path: '/dashboard/bancos/reportes/saldos-bancos', icon: BarChart3 },
    { name: 'Saldos en Chequera', path: '/dashboard/bancos/reportes/saldos-chequera', icon: BarChart3 },
    { name: 'Impresión de Cheques', path: '/dashboard/bancos/reportes/impresion-cheques', icon: Printer },
    { name: 'Cheques por Fecha', path: '/dashboard/bancos/reportes/cheques-fecha', icon: DollarSign },
    { name: 'Movimientos por Fecha', path: '/dashboard/bancos/reportes/movimientos-fecha', icon: FileText },
];

export const consultasOtras = [
    { name: 'Cumpleañeros', path: '/dashboard/consultas/otras/cumpleanos', icon: FileText },
    { name: 'Backup DB Check', path: '/dashboard/consultas/otras/backup-db-check', icon: HardDrive },
];

export const finanzasMenu = [
    { name: 'Préstamos y Créditos', path: '/dashboard/finanzas/prestamos', icon: Landmark },
    { name: 'Calculadora de Amortización', path: '/dashboard/finanzas/calculadora', icon: Calculator },
    { name: 'Evaluador de Inversiones y ROI', path: '/dashboard/finanzas/inversiones', icon: TrendingUp },
    { name: 'Planes y Mantenimiento', path: '/dashboard/finanzas/planes-mantenimiento', icon: Wrench },
    { name: 'Asesor y Proyecciones IA', path: '/dashboard/finanzas/asesor', icon: Sparkles },
    { name: 'Resumen y Vencimientos', path: '/dashboard/finanzas/resumen', icon: BarChart3 },
];

export const securityItems = [
    { name: 'Usuarios', path: '/dashboard/users', icon: Users },
    { name: 'Permisos', path: '/dashboard/permissions', icon: Shield },
    { name: 'Bitácora', path: '/dashboard/bitacora', icon: ClipboardList },
];

export const configuracionMenu = [
    { name: 'Conexión Externa', path: '/dashboard/settings/database', icon: Database },
    { name: 'Conexión Contabilidad', path: '/dashboard/settings/accounting', icon: Database },
    { name: 'Configuración Correo', path: '/dashboard/settings/email', icon: Mail },
];

export const systemNavItems = [
    { name: 'Configuración', path: '/dashboard/settings', icon: SettingsIcon },
];

export const allNavCategories = [
    { title: 'Principal', items: mainNavItems },
    { title: 'Catálogos', items: catalogItems },
    { title: 'Bancos', items: bancosMenu },
    { title: 'Bancos - Reportes', items: bancosReportes },
    { title: 'Finanzas', items: finanzasMenu },
    { title: 'Operaciones', items: operacionesMenu },
    { title: 'Consultas - Estaciones', items: consultasEstaciones },
    { title: 'Consultas - Otras', items: consultasOtras },
    { title: 'Seguridad', items: securityItems },
    { title: 'Configuración', items: configuracionMenu }
];
