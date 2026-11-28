import React from 'react';
import {
    Dashboard,
    Users,
    Carriers,
    Tankers,
    Consultas,
    VentasEstaciones,
    Lubricantes,
    ResumenPista,
    DiferenciasCombustible,
    PreciosEstacion,
    ConsultasPreciosCompetencia,
    PedidosCombustible,
    ControlRecordatorios,
    Permissions,
    CuentasBancarias,
    ConfiguracionDb,
    ConfiguracionEmail,
    ConfiguracionContabilidad,
    ConfiguracionTema,
    ConsultasCumpleanos,
    MovimientosBancarios,
    TransferenciasBancarias,
    ConciliacionBancaria,
    Cheques,
    ChequesContado,
    CheckDesigner,
    ImpresionCheques,
    ReporteChequesFecha,
    ReporteMovimientosFecha,
    BackupDBCheck,
    Bitacora,
    FinanzasPrestamos,
    FinanzasCalculadora,
    FinanzasInversiones,
    FinanzasPlanesMantenimiento,
    FinanzasAsesor,
    FinanzasCrecimiento,
    FinanzasResumen,
    EstrategiaTorreControl,
    EstrategiaCombustible,
    EstrategiaFlujoCaja,
    EstrategiaMermas,
    EstrategiaRentabilidad,
    EstrategiaCreditos,
    Tareas,
    ConsultaCambiosGithub,
    PlanillasRRHH,
    PedidosProgramadosConsulta,
    ConsultaPedidos,
    TelegramUsers,
    AsistenteIA,
    EnergiaSolarAndelsa,
    SupportTickets,
    ConfiguracionAgentesIA,
    ControlNAS,
    CentroTutoriales
} from '../pages/lazyPages';

const ADMIN_ROLE_NAMES = new Set([
    'administrator',
    'administrador',
    'admin',
    'super admin',
    'super administrador',
    'superadmin'
]);

/**
 * Redirecciones legadas hacia rutas canónicas actuales (fuente única para App.jsx y DashboardLayout.jsx).
 */
export const LEGACY_ROUTE_REDIRECTS = {
    '/dashboard/consultas/saldos-bancos': '/dashboard/bancos/reportes/saldos-bancos',
    '/dashboard/consultas/saldos-chequera': '/dashboard/bancos/reportes/saldos-chequera',
    '/dashboard/estrategia': '/dashboard/estrategia/torre-control',
    '/dashboard/estrategia/': '/dashboard/estrategia/torre-control'
};

/**
 * Evaluador único de permisos por ruta en el frontend (usado por PermissionRoute y DashboardLayout).
 */
export function hasRoutePermission(user, path) {
    if (!path || path === '/dashboard' || path === '/dashboard/tutoriales' || path === '/dashboard/settings/theme' || path === '/dashboard/seguridad/tickets') {
        return true;
    }
    if (!user) return false;
    const roleLabel = String(user.role || user.role_name || '').trim().toLowerCase();
    if (Number(user.role_id) === 1 || ADMIN_ROLE_NAMES.has(roleLabel)) {
        return true;
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes(path)) return true;
    if (path.startsWith('/dashboard/estrategia') && (perms.includes('view_direccion_estrategica') || perms.includes('/dashboard/estrategia'))) {
        return true;
    }
    if (path === '/dashboard/configuracion/agentes-ia' && (perms.includes('manage_telegram') || perms.includes('view_direccion_estrategica'))) {
        return true;
    }
    if (path === '/dashboard/seguridad/nas' && perms.includes('manage_nas_backups')) {
        return true;
    }
    if (path === '/dashboard/bancos/reportes/saldos-bancos' && perms.includes('/dashboard/consultas/saldos-bancos')) {
        return true;
    }
    if (path === '/dashboard/bancos/reportes/saldos-chequera' && perms.includes('/dashboard/consultas/saldos-chequera')) {
        return true;
    }
    if (path === '/dashboard/bancos/cuentas' && (perms.includes('manage_cuentas') || perms.includes('manage_chequeras'))) {
        return true;
    }
    if (path === '/dashboard/bancos/movimientos' && perms.includes('manage_movimientos')) {
        return true;
    }
    if (path === '/dashboard/bancos/transferencias' && (perms.includes('manage_movimientos') || perms.includes('/dashboard/bancos/movimientos'))) {
        return true;
    }
    if (path === '/dashboard/bancos/conciliacion' && (
        perms.includes('manage_conciliacion_bancaria') ||
        perms.includes('view_conciliacion_bancaria')
    )) {
        return true;
    }
    if (path === '/dashboard/bancos/cheques' && perms.includes('manage_cheques')) {
        return true;
    }
    if (path === '/dashboard/bancos/cheques-contado' && perms.includes('manage_cheques_contado')) {
        return true;
    }
    if (path === '/dashboard/bancos/check-designer' && perms.includes('manage_check_designer')) {
        return true;
    }
    return false;
}

const defineRoute = (relativePath, render, options = {}) => ({
    path: relativePath,
    fullPath: relativePath ? `/dashboard/${relativePath}` : '/dashboard',
    render,
    requiresPermission: options.requiresPermission !== false,
    childPaths: options.childPaths || []
});

/**
 * Fuente única de verdad de todas las pantallas del dashboard (React Router + pestañas keep-alive).
 */
export const DASHBOARD_ROUTES = [
    defineRoute('', () => <Dashboard />, { requiresPermission: false }),
    defineRoute('tutoriales', () => <CentroTutoriales />, { requiresPermission: false }),
    defineRoute('users', () => <Users />),
    defineRoute('carriers', () => <Carriers />),
    defineRoute('tankers', () => <Tankers />),
    defineRoute('consultas/estaciones', () => (
        <div className="card glass"><h1>Estaciones</h1><p>Módulo de estaciones (Próximamente).</p></div>
    ), { requiresPermission: false }),
    defineRoute('consultas/estaciones/ventas', () => <VentasEstaciones />),
    defineRoute('consultas/estaciones/lubricantes', () => <Lubricantes />),
    defineRoute('consultas/estaciones/resumen-cierre', () => <ResumenPista />),
    defineRoute('consultas/estaciones/diferencias-combustible', () => <DiferenciasCombustible />),
    defineRoute('consultas/estaciones/precios', () => <PreciosEstacion />),
    defineRoute('consultas/estaciones/precios-competencia', () => <ConsultasPreciosCompetencia />),
    defineRoute('operaciones/pedidos', () => <PedidosCombustible />),
    defineRoute('operaciones/pedidos-programados', () => <PedidosProgramadosConsulta />),
    defineRoute('operaciones/consulta-pedidos', () => <ConsultaPedidos />),
    defineRoute('operaciones/recordatorios', () => <ControlRecordatorios />),
    defineRoute('operaciones/tareas', () => <Tareas />),
    defineRoute('operaciones/energia-solar', () => <EnergiaSolarAndelsa />),
    defineRoute('bancos/reportes/saldos-bancos', () => (
        <Consultas type="saldos-bancos" title="Saldos en Bancos" description="Reporte de saldos consolidados en bancos." />
    )),
    defineRoute('bancos/reportes/saldos-chequera', () => (
        <Consultas type="saldos-chequera" title="Saldos en Chequera" description="Reporte de saldos en chequeras a la fecha actual." />
    )),
    defineRoute('bancos/reportes/impresion-cheques', () => <ImpresionCheques />),
    defineRoute('bancos/reportes/cheques-fecha', () => <ReporteChequesFecha />),
    defineRoute('bancos/reportes/movimientos-fecha', () => <ReporteMovimientosFecha />),
    defineRoute('consultas/ia-asistente', () => <AsistenteIA />),
    defineRoute('consultas/otras/cumpleanos', () => <ConsultasCumpleanos />),
    defineRoute('consultas/otras/backup-db-check', () => <BackupDBCheck />),
    defineRoute('bancos/cuentas', () => <CuentasBancarias />),
    defineRoute('bancos/movimientos', () => <MovimientosBancarios />),
    defineRoute('bancos/transferencias', () => <TransferenciasBancarias />),
    defineRoute('bancos/conciliacion', () => <ConciliacionBancaria />),
    defineRoute('bancos/cheques', () => <Cheques />),
    defineRoute('bancos/cheques-contado', () => <ChequesContado />),
    defineRoute('bancos/check-designer', () => <CheckDesigner />, {
        childPaths: ['bancos/check-designer/edit/:formatId']
    }),
    defineRoute('finanzas/prestamos', () => <FinanzasPrestamos />),
    defineRoute('finanzas/calculadora', () => <FinanzasCalculadora />),
    defineRoute('finanzas/inversiones', () => <FinanzasInversiones />),
    defineRoute('finanzas/planes-mantenimiento', () => <FinanzasPlanesMantenimiento />),
    defineRoute('finanzas/asesor', () => <FinanzasAsesor />),
    defineRoute('finanzas/crecimiento', () => <FinanzasCrecimiento />),
    defineRoute('finanzas/resumen', () => <FinanzasResumen />),
    defineRoute('rrhh/planillas', () => <PlanillasRRHH />),
    defineRoute('estrategia/torre-control', () => <EstrategiaTorreControl />),
    defineRoute('estrategia/combustible', () => <EstrategiaCombustible />),
    defineRoute('estrategia/flujo-caja', () => <EstrategiaFlujoCaja />),
    defineRoute('estrategia/mermas', () => <EstrategiaMermas />),
    defineRoute('estrategia/rentabilidad', () => <EstrategiaRentabilidad />),
    defineRoute('estrategia/creditos', () => <EstrategiaCreditos />),
    defineRoute('settings/theme', () => <ConfiguracionTema />),
    defineRoute('configuracion/agentes-ia', () => <ConfiguracionAgentesIA />),
    defineRoute('settings/database', () => <ConfiguracionDb />),
    defineRoute('settings/accounting', () => <ConfiguracionContabilidad />),
    defineRoute('settings/email', () => <ConfiguracionEmail />),
    defineRoute('permissions', () => <Permissions />),
    defineRoute('bitacora', () => <Bitacora />),
    defineRoute('seguridad/cambios', () => <ConsultaCambiosGithub />),
    defineRoute('seguridad/telegram', () => <TelegramUsers />),
    defineRoute('seguridad/nas', () => <ControlNAS />),
    defineRoute('seguridad/tickets', () => <SupportTickets />)
];

const ROUTE_BY_FULL_PATH = new Map(DASHBOARD_ROUTES.map((r) => [r.fullPath, r]));

/**
 * Resuelve el elemento React correspondiente a un path del dashboard para renderizado en pestañas.
 */
export function getRouteElement(fullPath) {
    const canonical = LEGACY_ROUTE_REDIRECTS[fullPath] || fullPath;
    const match = ROUTE_BY_FULL_PATH.get(canonical);
    return match ? match.render() : null;
}
