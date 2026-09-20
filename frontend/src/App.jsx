import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoadingFallback from './components/LoadingFallback';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './components/ThemeProvider';
import UpdateNotifier from './components/UpdateNotifier';

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
    ConsultasCumpleanos,
    MovimientosBancarios,
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
    FinanzasResumen
} from './pages/lazyPages';

const Login = lazy(() => import('./pages/Login'));
const DashboardLayout = lazy(() => import('./pages/DashboardLayout'));

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    if (!token) return <Navigate to="/login" replace />;
    return children;
};

const PermissionRoute = ({ pathKey, children }) => {
    const user = JSON.parse(localStorage.getItem('user')) || {};
    if (user.role_id === 1 || user.role === 'Administrator' || user.role_name === 'Administrator') return children;
    if (user.permissions?.includes(pathKey)) return children;
    if (pathKey === '/dashboard/bancos/reportes/saldos-bancos' && user.permissions?.includes('/dashboard/consultas/saldos-bancos')) return children;
    if (pathKey === '/dashboard/bancos/reportes/saldos-chequera' && user.permissions?.includes('/dashboard/consultas/saldos-chequera')) return children;
    return <Navigate to="/dashboard" replace />;
};

function App() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <ConfirmProvider>
                    <UpdateNotifier />
                    <BrowserRouter>
                        <Suspense fallback={<LoadingFallback fullScreen message="Cargando SIPE Admin..." />}>
                            <Routes>
                                <Route path="/login" element={<Login />} />
                                <Route
                                    path="/dashboard"
                                    element={
                                        <ProtectedRoute>
                                            <DashboardLayout />
                                        </ProtectedRoute>
                                    }
                                >
                                    <Route index element={<Dashboard />} />
                                    <Route path="users" element={<PermissionRoute pathKey="/dashboard/users"><Users /></PermissionRoute>} />
                                    <Route path="carriers" element={<PermissionRoute pathKey="/dashboard/carriers"><Carriers /></PermissionRoute>} />
                                    <Route path="tankers" element={<PermissionRoute pathKey="/dashboard/tankers"><Tankers /></PermissionRoute>} />
                                    <Route path="consultas/estaciones" element={<div className="card glass"><h1>Estaciones</h1><p>Módulo de estaciones (Próximamente).</p></div>} />
                                    <Route path="consultas/estaciones/ventas" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/ventas"><VentasEstaciones /></PermissionRoute>} />
                                    <Route path="consultas/estaciones/lubricantes" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/lubricantes"><Lubricantes /></PermissionRoute>} />
                                    <Route path="consultas/estaciones/resumen-cierre" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/resumen-cierre"><ResumenPista /></PermissionRoute>} />
                                    <Route path="consultas/estaciones/diferencias-combustible" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/diferencias-combustible"><DiferenciasCombustible /></PermissionRoute>} />
                                    <Route path="consultas/estaciones/precios" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/precios"><PreciosEstacion /></PermissionRoute>} />
                                    <Route path="consultas/estaciones/precios-competencia" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/precios-competencia"><ConsultasPreciosCompetencia /></PermissionRoute>} />
                                    <Route path="operaciones/pedidos" element={<ProtectedRoute><PedidosCombustible /></ProtectedRoute>} />
                                    <Route path="operaciones/recordatorios" element={<ProtectedRoute><ControlRecordatorios /></ProtectedRoute>} />
                                    <Route path="bancos/reportes/saldos-bancos" element={<PermissionRoute pathKey="/dashboard/bancos/reportes/saldos-bancos"><Consultas type="saldos-bancos" title="Saldos en Bancos" description="Reporte de saldos consolidados en bancos." /></PermissionRoute>} />
                                    <Route path="bancos/reportes/saldos-chequera" element={<PermissionRoute pathKey="/dashboard/bancos/reportes/saldos-chequera"><Consultas type="saldos-chequera" title="Saldos en Chequera" description="Reporte de saldos en chequeras a la fecha actual." /></PermissionRoute>} />
                                    <Route path="bancos/reportes/impresion-cheques" element={<PermissionRoute pathKey="/dashboard/bancos/reportes/impresion-cheques"><ImpresionCheques /></PermissionRoute>} />
                                    <Route path="bancos/reportes/cheques-fecha" element={<PermissionRoute pathKey="/dashboard/bancos/reportes/cheques-fecha"><ReporteChequesFecha /></PermissionRoute>} />
                                    <Route path="bancos/reportes/movimientos-fecha" element={<PermissionRoute pathKey="/dashboard/bancos/reportes/movimientos-fecha"><ReporteMovimientosFecha /></PermissionRoute>} />
                                    <Route path="consultas/saldos-bancos" element={<Navigate to="/dashboard/bancos/reportes/saldos-bancos" replace />} />
                                    <Route path="consultas/saldos-chequera" element={<Navigate to="/dashboard/bancos/reportes/saldos-chequera" replace />} />
                                    <Route path="consultas/otras/cumpleanos" element={<PermissionRoute pathKey="/dashboard/consultas/otras/cumpleanos"><ConsultasCumpleanos /></PermissionRoute>} />
                                    <Route path="consultas/otras/backup-db-check" element={<PermissionRoute pathKey="/dashboard/consultas/otras/backup-db-check"><BackupDBCheck /></PermissionRoute>} />
                                    <Route path="bancos/cuentas" element={<PermissionRoute pathKey="/dashboard/bancos/cuentas"><CuentasBancarias /></PermissionRoute>} />
                                    <Route path="bancos/movimientos" element={<PermissionRoute pathKey="/dashboard/bancos/movimientos"><MovimientosBancarios /></PermissionRoute>} />
                                    <Route path="bancos/conciliacion" element={<PermissionRoute pathKey="/dashboard/bancos/conciliacion"><ConciliacionBancaria /></PermissionRoute>} />
                                    <Route path="bancos/cheques" element={<PermissionRoute pathKey="/dashboard/bancos/cheques"><Cheques /></PermissionRoute>} />
                                    <Route path="bancos/cheques-contado" element={<PermissionRoute pathKey="/dashboard/bancos/cheques-contado"><ChequesContado /></PermissionRoute>} />
                                    <Route path="bancos/check-designer" element={<PermissionRoute pathKey="/dashboard/bancos/check-designer"><CheckDesigner /></PermissionRoute>} />
                                    <Route path="bancos/check-designer/edit/:formatId" element={<PermissionRoute pathKey="/dashboard/bancos/check-designer"><CheckDesigner /></PermissionRoute>} />
                                    <Route path="finanzas/prestamos" element={<PermissionRoute pathKey="/dashboard/finanzas/prestamos"><FinanzasPrestamos /></PermissionRoute>} />
                                    <Route path="finanzas/calculadora" element={<PermissionRoute pathKey="/dashboard/finanzas/calculadora"><FinanzasCalculadora /></PermissionRoute>} />
                                    <Route path="finanzas/inversiones" element={<PermissionRoute pathKey="/dashboard/finanzas/inversiones"><FinanzasInversiones /></PermissionRoute>} />
                                    <Route path="finanzas/planes-mantenimiento" element={<PermissionRoute pathKey="/dashboard/finanzas/planes-mantenimiento"><FinanzasPlanesMantenimiento /></PermissionRoute>} />
                                    <Route path="finanzas/asesor" element={<PermissionRoute pathKey="/dashboard/finanzas/asesor"><FinanzasAsesor /></PermissionRoute>} />
                                    <Route path="finanzas/resumen" element={<PermissionRoute pathKey="/dashboard/finanzas/resumen"><FinanzasResumen /></PermissionRoute>} />
                                    <Route path="settings/database" element={<PermissionRoute pathKey="/dashboard/settings/database"><ConfiguracionDb /></PermissionRoute>} />
                                    <Route path="settings/accounting" element={<PermissionRoute pathKey="/dashboard/settings/accounting"><ConfiguracionContabilidad /></PermissionRoute>} />
                                    <Route path="settings/email" element={<PermissionRoute pathKey="/dashboard/settings/email"><ConfiguracionEmail /></PermissionRoute>} />
                                    <Route path="permissions" element={<PermissionRoute pathKey="/dashboard/permissions"><Permissions /></PermissionRoute>} />
                                    <Route path="bitacora" element={<PermissionRoute pathKey="/dashboard/bitacora"><Bitacora /></PermissionRoute>} />
                                </Route>
                                <Route path="*" element={<Navigate to="/login" replace />} />
                            </Routes>
                        </Suspense>
                    </BrowserRouter>
                </ConfirmProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}

export default App;
