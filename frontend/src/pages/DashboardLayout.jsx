import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Shield, Settings as SettingsIcon, LogOut, Truck, Container, Folder, ChevronDown, ChevronRight, FileText, BarChart3, Droplets } from 'lucide-react';

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [openCatalogs, setOpenCatalogs] = useState(false);
    const [openConsultas, setOpenConsultas] = useState(false);
    const [openConsultasBancos, setOpenConsultasBancos] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const mainNavItems = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Usuarios', path: '/dashboard/users', icon: Users },
    ];

    const catalogItems = [
        { name: 'Transportistas', path: '/dashboard/carriers', icon: Truck },
        { name: 'Pipas', path: '/dashboard/tankers', icon: Container },
    ];

    const consultasItemsRoot = [];

    const consultasEstaciones = [
        { name: 'Ventas', path: '/dashboard/consultas/estaciones/ventas', icon: FileText },
        { name: 'Lubricantes', path: '/dashboard/consultas/estaciones/lubricantes', icon: Droplets }
    ];

    const consultasBancos = [
        { name: 'Saldos en Bancos', path: '/dashboard/consultas/saldos-bancos', icon: BarChart3 },
        { name: 'Saldos en Chequera', path: '/dashboard/consultas/saldos-chequera', icon: BarChart3 },
    ];

    const systemNavItems = [
        { name: 'Configuración', path: '/dashboard/settings', icon: SettingsIcon },
        { name: 'Permisos', path: '/dashboard/permissions', icon: Shield },
    ];

    const [openConsultasEstaciones, setOpenConsultasEstaciones] = useState(false);

    useEffect(() => {
        if (catalogItems.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) {
            setOpenCatalogs(true);
        }
        if ([...consultasItemsRoot, ...consultasEstaciones, ...consultasBancos].some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) {
            setOpenConsultas(true);
        }
        if (consultasBancos.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) {
            setOpenConsultasBancos(true);
        }
        if (consultasEstaciones.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) {
            setOpenConsultasEstaciones(true);
        }
    }, [location.pathname]);

    const renderNavItem = (item, isSubItem = false) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
            <Link
                key={item.name}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={isSubItem ? { paddingLeft: '2.5rem', fontSize: '0.9rem' } : {}}
            >
                <Icon size={isSubItem ? 18 : 20} />
                {item.name}
            </Link>
        );
    };

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <h2>SIPE ADMIN</h2>
                <nav className="sidebar-nav">
                    {mainNavItems.map(item => renderNavItem(item))}
                    
                    {/* Expandable Catalogs Menu */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <button 
                            className="nav-item" 
                            onClick={() => setOpenCatalogs(!openCatalogs)}
                            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Folder size={20} />
                                Catálogos
                            </div>
                            {openCatalogs ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        
                        {openCatalogs && (
                            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                {catalogItems.map(item => renderNavItem(item, true))}
                            </div>
                        )}
                    </div>

                    {/* Expandable Consultas Menu */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <button 
                            className="nav-item" 
                            onClick={() => setOpenConsultas(!openConsultas)}
                            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <FileText size={20} />
                                Consultas
                            </div>
                            {openConsultas ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        
                        {openConsultas && (
                            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                {/* root level Consultas items */}
                                {consultasItemsRoot.map(item => renderNavItem(item, true))}
                                
                                {/* level 2 Estaciones expandable */}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <button 
                                        className="nav-item" 
                                        onClick={() => setOpenConsultasEstaciones(!openConsultasEstaciones)}
                                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <Folder size={18} />
                                            Estaciones
                                        </div>
                                        {openConsultasEstaciones ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    
                                    {openConsultasEstaciones && (
                                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                            {consultasEstaciones.map(item => {
                                                const Icon = item.icon;
                                                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                                                return (
                                                    <Link
                                                        key={item.name}
                                                        to={item.path}
                                                        className={`nav-item ${isActive ? 'active' : ''}`}
                                                        style={{ paddingLeft: '3.75rem', fontSize: '0.85rem' }}
                                                    >
                                                        <Icon size={16} />
                                                        {item.name}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <button 
                                        className="nav-item" 
                                        onClick={() => setOpenConsultasBancos(!openConsultasBancos)}
                                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <Folder size={18} />
                                            Bancos
                                        </div>
                                        {openConsultasBancos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    
                                    {openConsultasBancos && (
                                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                            {consultasBancos.map(item => {
                                                const Icon = item.icon;
                                                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                                                return (
                                                    <Link
                                                        key={item.name}
                                                        to={item.path}
                                                        className={`nav-item ${isActive ? 'active' : ''}`}
                                                        style={{ paddingLeft: '3.75rem', fontSize: '0.85rem' }}
                                                    >
                                                        <Icon size={16} />
                                                        {item.name}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {systemNavItems.map(item => renderNavItem(item))}
                </nav>
                <div style={{ marginTop: 'auto' }}>
                    <button onClick={handleLogout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left' }}>
                        <LogOut size={20} />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
