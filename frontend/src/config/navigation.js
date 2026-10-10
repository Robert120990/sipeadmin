import { createColorIcon } from '../components/ColorIcon';

export const mainNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: createColorIcon('fluent-color:home-24') },
];

export const estrategiaMenu = [
    { name: 'Torre de Control', path: '/dashboard/estrategia/torre-control', icon: createColorIcon('fluent-emoji-flat:compass') },
    { name: 'Combustible & DGEHM', path: '/dashboard/estrategia/combustible', icon: createColorIcon('fluent-emoji-flat:fuel-pump') },
    { name: 'Flujo de Caja Predictivo', path: '/dashboard/estrategia/flujo-caja', icon: createColorIcon('flat-color-icons:debt') },
    { name: 'Auditoría de Mermas', path: '/dashboard/estrategia/mermas', icon: createColorIcon('flat-color-icons:inspection') },
    { name: 'P&L por Estación', path: '/dashboard/estrategia/rentabilidad', icon: createColorIcon('flat-color-icons:sales-performance') },
    { name: 'Crédito y Flotas', path: '/dashboard/estrategia/creditos', icon: createColorIcon('flat-color-icons:automotive') },
];

export const catalogItems = [
    { name: 'Transportistas', path: '/dashboard/carriers', icon: createColorIcon('flat-color-icons:shipped') },
    { name: 'Pipas', path: '/dashboard/tankers', icon: createColorIcon('fluent-emoji-flat:oil-drum') },
];

export const consultasItemsRoot = [];

export const consultasEstaciones = [
    { name: 'Resumen de Ventas', path: '/dashboard/consultas/estaciones/ventas', icon: createColorIcon('flat-color-icons:document') },
    { name: 'Venta de Lubricantes', path: '/dashboard/consultas/estaciones/lubricantes', icon: createColorIcon('fluent-emoji-flat:droplet') },
    { name: 'Resumen de Cierre', path: '/dashboard/consultas/estaciones/resumen-cierre', icon: createColorIcon('flat-color-icons:data-sheet') },
    { name: 'Diferencias Combustible', path: '/dashboard/consultas/estaciones/diferencias-combustible', icon: createColorIcon('flat-color-icons:bar-chart') },
    { name: 'Precios Estación', path: '/dashboard/consultas/estaciones/precios', icon: createColorIcon('flat-color-icons:paid') },
    { name: 'Precios Competencia', path: '/dashboard/consultas/estaciones/precios-competencia', icon: createColorIcon('flat-color-icons:bullish') }
];

export const operacionesMenu = [
    {
        name: 'Pedidos Combustible',
        path: '/dashboard/operaciones/pedidos',
        icon: createColorIcon('fluent-emoji-flat:fuel-pump')
    },
    {
        name: 'Pedidos Programados',
        path: '/dashboard/operaciones/pedidos-programados',
        icon: createColorIcon('flat-color-icons:calendar')
    },
    {
        name: 'Control de Pagos',
        path: '/dashboard/operaciones/recordatorios',
        icon: createColorIcon('flat-color-icons:money-transfer')
    },
    {
        name: 'Gestión de Tareas',
        path: '/dashboard/operaciones/tareas',
        icon: createColorIcon('flat-color-icons:todo-list')
    }
];

export const bancosMenu = [
    { name: 'Cuentas Bancarias', path: '/dashboard/bancos/cuentas', icon: createColorIcon('fluent-emoji-flat:bank') },
    { name: 'Movimientos Bancarios', path: '/dashboard/bancos/movimientos', icon: createColorIcon('flat-color-icons:view-details') },
    { name: 'Conciliación Bancaria', path: '/dashboard/bancos/conciliacion', icon: createColorIcon('fluent-emoji-flat:balance-scale') },
    { name: 'Cheques', path: '/dashboard/bancos/cheques', icon: createColorIcon('flat-color-icons:currency-exchange') },
    { name: 'Cheques Contado', path: '/dashboard/bancos/cheques-contado', icon: createColorIcon('fluent-emoji-flat:credit-card') },
    { name: 'Diseñador de Cheques', path: '/dashboard/bancos/check-designer', icon: createColorIcon('fluent-color:drafts-24') },
];

export const bancosReportes = [
    { name: 'Saldos en Bancos', path: '/dashboard/bancos/reportes/saldos-bancos', icon: createColorIcon('fluent-color:data-pie-24') },
    { name: 'Saldos en Chequera', path: '/dashboard/bancos/reportes/saldos-chequera', icon: createColorIcon('flat-color-icons:safe') },
    { name: 'Impresión de Cheques', path: '/dashboard/bancos/reportes/impresion-cheques', icon: createColorIcon('flat-color-icons:print') },
    { name: 'Cheques por Fecha', path: '/dashboard/bancos/reportes/cheques-fecha', icon: createColorIcon('flat-color-icons:planner') },
    { name: 'Movimientos por Fecha', path: '/dashboard/bancos/reportes/movimientos-fecha', icon: createColorIcon('flat-color-icons:rules') },
];

export const consultasOtras = [
    { name: 'Cumpleañeros', path: '/dashboard/consultas/otras/cumpleanos', icon: createColorIcon('flat-color-icons:advertising') },
    { name: 'Backup DB Check', path: '/dashboard/consultas/otras/backup-db-check', icon: createColorIcon('flat-color-icons:database') },
];

export const finanzasMenu = [
    { name: 'Préstamos y Créditos', path: '/dashboard/finanzas/prestamos', icon: createColorIcon('flat-color-icons:debt') },
    { name: 'Calculadora de Amortización', path: '/dashboard/finanzas/calculadora', icon: createColorIcon('flat-color-icons:calculator') },
    { name: 'Evaluador de Inversiones y ROI', path: '/dashboard/finanzas/inversiones', icon: createColorIcon('flat-color-icons:line-chart') },
    { name: 'Planes y Mantenimiento', path: '/dashboard/finanzas/planes-mantenimiento', icon: createColorIcon('flat-color-icons:services') },
    { name: 'Asesor y Proyecciones IA', path: '/dashboard/finanzas/asesor', icon: createColorIcon('flat-color-icons:idea') },
    { name: 'Resumen y Vencimientos', path: '/dashboard/finanzas/resumen', icon: createColorIcon('flat-color-icons:combo-chart') },
];

export const rrhhMenu = [
    { name: 'Planillas', path: '/dashboard/rrhh/planillas', icon: createColorIcon('fluent-color:people-community-24') },
];

export const securityItems = [
    { name: 'Usuarios', path: '/dashboard/users', icon: createColorIcon('flat-color-icons:businessman') },
    { name: 'Permisos', path: '/dashboard/permissions', icon: createColorIcon('flat-color-icons:privacy') },
    { name: 'Bitácora', path: '/dashboard/bitacora', icon: createColorIcon('flat-color-icons:timeline') },
    { name: 'Consulta de Cambios', path: '/dashboard/seguridad/cambios', icon: createColorIcon('flat-color-icons:workflow') },
];

export const configuracionMenu = [
    { name: 'Tema y Apariencia', path: '/dashboard/settings/theme', icon: createColorIcon('flat-color-icons:gallery') },
    { name: 'Conexión Externa', path: '/dashboard/settings/database', icon: createColorIcon('flat-color-icons:data-backup') },
    { name: 'Conexión Contabilidad', path: '/dashboard/settings/accounting', icon: createColorIcon('flat-color-icons:data-configuration') },
    { name: 'Configuración Correo', path: '/dashboard/settings/email', icon: createColorIcon('flat-color-icons:feedback') },
];

export const systemNavItems = [
    { name: 'Configuración', path: '/dashboard/settings', icon: createColorIcon('fluent-color:settings-24') },
];

export const allNavCategories = [
    { title: 'Principal', items: mainNavItems },
    { title: 'Dirección Estratégica', items: estrategiaMenu },
    { title: 'Catálogos', items: catalogItems },
    { title: 'Bancos', items: bancosMenu },
    { title: 'Bancos - Reportes', items: bancosReportes },
    { title: 'Finanzas', items: finanzasMenu },
    { title: 'Recursos Humanos', items: rrhhMenu },
    { title: 'Operaciones', items: operacionesMenu },
    { title: 'Consultas - Estaciones', items: consultasEstaciones },
    { title: 'Consultas - Otras', items: consultasOtras },
    { title: 'Seguridad', items: securityItems },
    { title: 'Configuración', items: configuracionMenu }
];
