import { LayoutDashboard, Users, Shield, Settings as SettingsIcon, Truck, Container, FileText, BarChart3, Droplets, ClipboardList, DollarSign, Landmark, Database, Mail, MoreHorizontal } from 'lucide-react';

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
    { name: 'Precios Estación', path: '/dashboard/consultas/estaciones/precios', icon: DollarSign }
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
];

export const consultasBancos = [
    { name: 'Saldos en Bancos', path: '/dashboard/consultas/saldos-bancos', icon: BarChart3 },
    { name: 'Saldos en Chequera', path: '/dashboard/consultas/saldos-chequera', icon: BarChart3 },
];

export const consultasOtras = [
    { name: 'Cumpleañeros', path: '/dashboard/consultas/otras/cumpleanos', icon: FileText },
];

export const securityItems = [
    { name: 'Usuarios', path: '/dashboard/users', icon: Users },
    { name: 'Permisos', path: '/dashboard/permissions', icon: Shield },
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
    { title: 'Operaciones', items: operacionesMenu },
    { title: 'Consultas - Estaciones', items: consultasEstaciones },
    { title: 'Consultas - Bancos', items: consultasBancos },
    { title: 'Consultas - Otras', items: consultasOtras },
    { title: 'Seguridad', items: securityItems },
    { title: 'Configuración', items: configuracionMenu }
];
