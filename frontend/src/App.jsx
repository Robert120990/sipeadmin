import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './pages/DashboardLayout';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Carriers from './pages/Carriers';
import Tankers from './pages/Tankers';
import Consultas from './pages/Consultas';
import VentasEstaciones from './pages/VentasEstaciones';
import Lubricantes from './pages/Lubricantes';
import ResumenPista from './pages/ResumenPista';
import { ToastProvider } from './components/Toast';

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    if (!token) return <Navigate to="/login" replace />;
    return children;
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
                        <Route index element={<div className="card glass"><h1>Dashboard</h1><p>Sistema de gestión administrativa.</p></div>} />
                        <Route path="users" element={<Users />} />
                        <Route path="carriers" element={<Carriers />} />
                        <Route path="tankers" element={<Tankers />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="consultas/estaciones" element={<div className="card glass"><h1>Estaciones</h1><p>Módulo de estaciones (Próximamente).</p></div>} />
                        <Route path="consultas/estaciones/ventas" element={<VentasEstaciones />} />
                        <Route path="consultas/estaciones/lubricantes" element={<Lubricantes />} />
                        <Route path="consultas/pista/resumen-cierre" element={<ResumenPista />} />
                        <Route path="consultas/saldos-bancos" element={<Consultas type="saldos-bancos" title="Saldos en Bancos" description="Reporte de saldos bancarios a la fecha actual." />} />
                        <Route path="consultas/saldos-chequera" element={<Consultas type="saldos-chequera" title="Saldos en Chequera" description="Reporte de saldos en chequeras a la fecha actual." />} />
                        <Route path="permissions" element={<div className="card glass"><h1>Permisos</h1><p>Módulo en desarrollo.</p></div>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </ToastProvider>
    );
}

export default App;
