import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoadingFallback from './components/LoadingFallback';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './components/ThemeProvider';
import UpdateNotifier from './components/UpdateNotifier';
import { getStoredUser, getStoredToken } from './utils/auth';
import { NotificationProvider } from './context/NotificationContext';
import { TicketProvider } from './context/TicketContext';
import { RealtimeNotificationToast } from './components/NotificationBell';
import {
    DASHBOARD_ROUTES,
    LEGACY_ROUTE_REDIRECTS,
    hasRoutePermission
} from './config/routeRegistry';

const Login = lazy(() => import('./pages/Login'));
const DashboardLayout = lazy(() => import('./pages/DashboardLayout'));

const ProtectedRoute = ({ children }) => {
    const token = getStoredToken();
    if (!token) return <Navigate to="/login" replace />;
    return children;
};

const PermissionRoute = ({ pathKey, children }) => {
    const user = getStoredUser();
    if (hasRoutePermission(user, pathKey)) return children;
    return <Navigate to="/dashboard" replace />;
};

function App() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <ConfirmProvider>
                    <UpdateNotifier />
                    <BrowserRouter>
                        <NotificationProvider>
                            <TicketProvider>
                                <RealtimeNotificationToast />
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
                                            {DASHBOARD_ROUTES.flatMap((route) => {
                                                const element = route.requiresPermission ? (
                                                    <PermissionRoute pathKey={route.fullPath}>
                                                        {route.render()}
                                                    </PermissionRoute>
                                                ) : (
                                                    route.render()
                                                );

                                                if (route.path === '') {
                                                    return [<Route key="index" index element={element} />];
                                                }

                                                return [
                                                    <Route key={route.path} path={route.path} element={element} />,
                                                    ...route.childPaths.map((childPath) => (
                                                        <Route key={childPath} path={childPath} element={element} />
                                                    ))
                                                ];
                                            })}
                                            {Object.entries(LEGACY_ROUTE_REDIRECTS)
                                                .filter(([from]) => !from.endsWith('/'))
                                                .map(([from, to]) => {
                                                    const relFrom = from.replace(/^\/dashboard\//, '');
                                                    return (
                                                        <Route
                                                            key={`redirect-${relFrom}`}
                                                            path={relFrom}
                                                            element={<Navigate to={to} replace />}
                                                        />
                                                    );
                                                })}
                                        </Route>
                                        <Route path="*" element={<Navigate to="/login" replace />} />
                                    </Routes>
                                </Suspense>
                            </TicketProvider>
                        </NotificationProvider>
                    </BrowserRouter>
                </ConfirmProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}

export default App;
