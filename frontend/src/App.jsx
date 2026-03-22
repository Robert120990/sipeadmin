import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './pages/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Carriers from './pages/Carriers';
import Tankers from './pages/Tankers';
import Consultas from './pages/Consultas';
import VentasEstaciones from './pages/VentasEstaciones';
import Lubricantes from './pages/Lubricantes';
import ResumenPista from './pages/ResumenPista';
import DiferenciasCombustible from './pages/DiferenciasCombustible';
import PreciosEstacion from './pages/PreciosEstacion';
import PedidosCombustible from './pages/PedidosCombustible';
import ControlRecordatorios from './pages/ControlRecordatorios';
import Permissions from './pages/Permissions';
import CuentasBancarias from './pages/CuentasBancarias';
import { ToastProvider } from './components/Toast';

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    if (!token) return <Navigate to="/login" replace />;
    return children;
};

const PermissionRoute = ({ pathKey, children }) => {
    const user = JSON.parse(localStorage.getItem('user')) || {};
    if (user.role_id === 1) return children;
    if (user.permissions?.includes(pathKey)) return children;
    return <Navigate to="/dashboard" replace />;
};

function App() {
    return (
        <ToastProvider>
            <BrowserRouter>
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
                        <Route path="settings" element={<PermissionRoute pathKey="/dashboard/settings"><Settings /></PermissionRoute>} />
                        <Route path="consultas/estaciones" element={<div className="card glass"><h1>Estaciones</h1><p>Módulo de estaciones (Próximamente).</p></div>} />
                        <Route path="consultas/estaciones/ventas" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/ventas"><VentasEstaciones /></PermissionRoute>} />
                        <Route path="consultas/estaciones/lubricantes" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/lubricantes"><Lubricantes /></PermissionRoute>} />
                        <Route path="consultas/estaciones/resumen-cierre" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/resumen-cierre"><ResumenPista /></PermissionRoute>} />
                        <Route path="consultas/estaciones/diferencias-combustible" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/diferencias-combustible"><DiferenciasCombustible /></PermissionRoute>} />
                        <Route path="consultas/estaciones/precios" element={<PermissionRoute pathKey="/dashboard/consultas/estaciones/precios"><PreciosEstacion /></PermissionRoute>} />
                        <Route path="operaciones/pedidos" element={<ProtectedRoute><PedidosCombustible /></ProtectedRoute>} />
                        <Route path="operaciones/recordatorios" element={<ProtectedRoute><ControlRecordatorios /></ProtectedRoute>} />
                        <Route path="consultas/saldos-bancos" element={<PermissionRoute pathKey="/dashboard/consultas/saldos-bancos"><Consultas type="saldos-bancos" title="Saldos en Bancos" description="Reporte de saldos bancarios a la fecha actual." /></PermissionRoute>} />
                        <Route path="consultas/saldos-chequera" element={<PermissionRoute pathKey="/dashboard/consultas/saldos-chequera"><Consultas type="saldos-chequera" title="Saldos en Chequera" description="Reporte de saldos en chequeras a la fecha actual." /></PermissionRoute>} />
                        <Route path="bancos/cuentas" element={<PermissionRoute pathKey="/dashboard/bancos/cuentas"><CuentasBancarias /></PermissionRoute>} />
                        <Route path="permissions" element={<PermissionRoute pathKey="/dashboard/permissions"><Permissions /></PermissionRoute>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </ToastProvider>
    );
}

export default App;
