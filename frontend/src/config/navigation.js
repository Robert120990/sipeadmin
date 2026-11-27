import { createColorIcon } from '../components/ColorIcon';

export const tutorialesNavItem = {
    name: 'Centro de Tutoriales',
    path: '/dashboard/tutoriales',
    icon: createColorIcon('flat-color-icons:idea'),
    keywords: ['tutorial', 'tutoriales', 'guia', 'ayuda', 'manual', 'paso a paso', 'operaciones', 'bancos', 'conciliacion', 'cheques', 'pedidos', 'capacitacion']
};

export const mainNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: createColorIcon('fluent-color:home-24') },
    tutorialesNavItem,
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
        name: 'Consulta de Pedidos',
        path: '/dashboard/operaciones/consulta-pedidos',
        icon: createColorIcon('flat-color-icons:inspection')
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
    },
    {
        name: 'Energía Solar & Andelsa',
        path: '/dashboard/operaciones/energia-solar',
        icon: createColorIcon('fluent-emoji-flat:sun')
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
    { name: 'Asistente IA', path: '/dashboard/consultas/ia-asistente', icon: createColorIcon('fluent-emoji-flat:robot') },
    { name: 'Cumpleañeros', path: '/dashboard/consultas/otras/cumpleanos', icon: createColorIcon('flat-color-icons:advertising') },
    { name: 'Backup DB Check', path: '/dashboard/consultas/otras/backup-db-check', icon: createColorIcon('flat-color-icons:database') },
];

export const finanzasMenu = [
    { name: 'Préstamos y Créditos', path: '/dashboard/finanzas/prestamos', icon: createColorIcon('flat-color-icons:debt') },
    { name: 'Calculadora de Amortización', path: '/dashboard/finanzas/calculadora', icon: createColorIcon('flat-color-icons:calculator') },
    { name: 'Evaluador de Inversiones y ROI', path: '/dashboard/finanzas/inversiones', icon: createColorIcon('flat-color-icons:line-chart') },
    { name: 'Planes y Mantenimiento', path: '/dashboard/finanzas/planes-mantenimiento', icon: createColorIcon('flat-color-icons:services') },
    { name: 'Asesor y Proyecciones IA', path: '/dashboard/finanzas/asesor', icon: createColorIcon('flat-color-icons:idea') },
    { name: 'Crecimiento Empresarial & AGY', path: '/dashboard/finanzas/crecimiento', icon: createColorIcon('flat-color-icons:bullish'), keywords: ['holding', 'impuestos', 'agy', 'conocimiento', '10m', 'granja', 'servidor'] },
    { name: 'Resumen y Vencimientos', path: '/dashboard/finanzas/resumen', icon: createColorIcon('flat-color-icons:combo-chart') },
];

export const rrhhMenu = [
    { name: 'Planillas', path: '/dashboard/rrhh/planillas', icon: createColorIcon('fluent-color:people-community-24') },
];

export const securityItems = [
    { name: 'Usuarios', path: '/dashboard/users', icon: createColorIcon('flat-color-icons:businessman') },
    { name: 'Permisos', path: '/dashboard/permissions', icon: createColorIcon('flat-color-icons:privacy') },
    { name: 'Usuarios de Telegram', path: '/dashboard/seguridad/telegram', icon: createColorIcon('flat-color-icons:comments') },
    {
        name: 'Control NAS & Backups',
        path: '/dashboard/seguridad/nas',
        icon: createColorIcon('flat-color-icons:data-backup'),
        keywords: ['nas', 'synology', 'backup', 'respaldo', 'base de datos', '192.168.31.222', '5.252.55.29', 'raulsosa']
    },
    { name: 'Bitácora', path: '/dashboard/bitacora', icon: createColorIcon('flat-color-icons:timeline') },
    { name: 'Consulta de Cambios', path: '/dashboard/seguridad/cambios', icon: createColorIcon('flat-color-icons:workflow') },
    { name: 'Tickets de Soporte', path: '/dashboard/seguridad/tickets', icon: createColorIcon('flat-color-icons:online-support') },
];

export const configuracionMenu = [
    { name: 'Agentes IA & Graphify', path: '/dashboard/configuracion/agentes-ia', icon: createColorIcon('fluent-emoji-flat:robot') },
    { name: 'Tema y Apariencia', path: '/dashboard/settings/theme', icon: createColorIcon('flat-color-icons:gallery') },
    { name: 'Conexión Externa', path: '/dashboard/settings/database', icon: createColorIcon('flat-color-icons:data-backup') },
    { name: 'Conexión Contabilidad', path: '/dashboard/settings/accounting', icon: createColorIcon('flat-color-icons:data-configuration') },
    { name: 'Configuración Correo', path: '/dashboard/settings/email', icon: createColorIcon('flat-color-icons:feedback') },
];

export const systemNavItems = [
    { name: 'Configuración', path: '/dashboard/settings', icon: createColorIcon('fluent-color:settings-24') },
];

export const specialActionPermissions = [
    { name: 'Autorizar Reapertura de Períodos de Conciliación', path: 'approve_reapertura_conciliacion', icon: createColorIcon('fluent-emoji-flat:balance-scale') },
    { name: 'Cerrar Períodos de Conciliación Bancaria', path: 'close_conciliacion_periodo', icon: createColorIcon('flat-color-icons:privacy') },
    { name: 'Modificar Montos en Conciliación Bancaria', path: 'edit_monto_conciliacion', icon: createColorIcon('flat-color-icons:currency-exchange') },
    { name: 'Conciliar y Desconciliar Movimientos', path: 'manage_conciliacion_bancaria', icon: createColorIcon('flat-color-icons:rules') },
    { name: 'Consultar Conciliación Bancaria (Solo Lectura)', path: 'view_conciliacion_bancaria', icon: createColorIcon('flat-color-icons:view-details') },
    { name: 'Gestionar Cuentas Bancarias', path: 'manage_cuentas', icon: createColorIcon('fluent-emoji-flat:bank') },
    { name: 'Gestionar Movimientos Bancarios', path: 'manage_movimientos', icon: createColorIcon('flat-color-icons:money-transfer') },
    { name: 'Gestionar Cheques Bancarios', path: 'manage_cheques', icon: createColorIcon('flat-color-icons:currency-exchange') },
    { name: 'Gestionar y Resolver Tickets (Soporte / AGY)', path: 'manage_support_tickets', icon: createColorIcon('flat-color-icons:online-support') },
    { name: 'Autorizar Pagos de Planillas RRHH', path: 'pay_rrhh_planillas', icon: createColorIcon('flat-color-icons:money-transfer') },
    { name: 'Consultar y Exportar Planillas RRHH', path: 'view_rrhh_planillas', icon: createColorIcon('fluent-color:people-community-24') },
    { name: 'Ejecutar Planes en Consola AGY & Conocimiento', path: 'manage_finanzas_crecimiento', icon: createColorIcon('flat-color-icons:bullish') },
    { name: 'Registrar / Anular Pagos de Préstamos', path: 'manage_finanzas_pagos', icon: createColorIcon('flat-color-icons:debt') },
    { name: 'Administrar Bot y Webhooks de Telegram', path: 'manage_telegram', icon: createColorIcon('flat-color-icons:comments') },
    { name: 'Administrar Servidores NAS y Backups BD', path: 'manage_nas_backups', icon: createColorIcon('flat-color-icons:data-backup') },
    { name: 'Acceso Global a Dirección Estratégica', path: 'view_direccion_estrategica', icon: createColorIcon('fluent-emoji-flat:compass') },
    { name: 'Administrar Usuarios (Crear / Editar / Baja)', path: 'manage_users', icon: createColorIcon('flat-color-icons:businessman') },
    { name: 'Administrar Roles y Permisos', path: 'manage_roles', icon: createColorIcon('flat-color-icons:privacy') },
    { name: 'Consultar Bitácora de Auditoría', path: 'view_bitacora', icon: createColorIcon('flat-color-icons:timeline') },
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
    { title: 'Configuración', items: configuracionMenu },
    { title: 'Permisos Especiales de Acción', items: specialActionPermissions }
];
