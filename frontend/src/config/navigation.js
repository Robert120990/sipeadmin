import { LayoutDashboard, Users, Shield, Settings as SettingsIcon, Truck, Container, FileText, BarChart3, Droplets, ClipboardList } from 'lucide-react';

export const mainNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
];

export const catalogItems = [
    { name: 'Transportistas', path: '/dashboard/carriers', icon: Truck },
    { name: 'Pipas', path: '/dashboard/tankers', icon: Container },
];

export const consultasItemsRoot = [];

export const consultasEstaciones = [
    { name: 'Ventas', path: '/dashboard/consultas/estaciones/ventas', icon: FileText },
    { name: 'Lubricantes', path: '/dashboard/consultas/estaciones/lubricantes', icon: Droplets },
    { name: 'Resumen de Cierre', path: '/dashboard/consultas/estaciones/resumen-cierre', icon: ClipboardList }
];

export const consultasBancos = [
    { name: 'Saldos en Bancos', path: '/dashboard/consultas/saldos-bancos', icon: BarChart3 },
    { name: 'Saldos en Chequera', path: '/dashboard/consultas/saldos-chequera', icon: BarChart3 },
];

export const securityItems = [
    { name: 'Usuarios', path: '/dashboard/users', icon: Users },
    { name: 'Permisos', path: '/dashboard/permissions', icon: Shield },
];

export const systemNavItems = [
    { name: 'Configuración', path: '/dashboard/settings', icon: SettingsIcon },
];

export const allNavCategories = [
    { title: 'Principal', items: mainNavItems },
    { title: 'Catálogos', items: catalogItems },
    { title: 'Consultas - Estaciones', items: consultasEstaciones },
    { title: 'Consultas - Bancos', items: consultasBancos },
    { title: 'Seguridad', items: securityItems },
    { title: 'Sistema', items: systemNavItems }
];
