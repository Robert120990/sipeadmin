import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Folder, ChevronDown, ChevronRight, Shield, FileText } from 'lucide-react';
import { mainNavItems, catalogItems, consultasItemsRoot, consultasEstaciones, consultasBancos, securityItems, systemNavItems } from '../config/navigation';

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [openCatalogs, setOpenCatalogs] = useState(false);
    const [openConsultas, setOpenConsultas] = useState(false);
    const [openConsultasEstaciones, setOpenConsultasEstaciones] = useState(false);
    const [openConsultasBancos, setOpenConsultasBancos] = useState(false);
    const [openSecurity, setOpenSecurity] = useState(false);

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const hasPermission = (path) => user.role_id === 1 || user.permissions?.includes(path);

    const filteredCatalogs = catalogItems.filter(item => hasPermission(item.path));
    const filteredEstaciones = consultasEstaciones.filter(item => hasPermission(item.path));
    const filteredBancos = consultasBancos.filter(item => hasPermission(item.path));
    const filteredSecurity = securityItems.filter(item => hasPermission(item.path));
    const filteredSystem = systemNavItems.filter(item => hasPermission(item.path));
    const hasAnyConsultas = consultasItemsRoot.some(item => hasPermission(item.path)) || filteredEstaciones.length > 0 || filteredBancos.length > 0;
    
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };


    useEffect(() => {
        if (securityItems.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) {
            setOpenSecurity(true);
        }
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
                    
                    {filteredCatalogs.length > 0 && (
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
                                    {filteredCatalogs.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Expandable Consultas Menu */}
                    {hasAnyConsultas && (
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
                                {consultasItemsRoot.filter(i => hasPermission(i.path)).map(item => renderNavItem(item, true))}
                                
                                {/* level 2 Estaciones expandable */}
                                {filteredEstaciones.length > 0 && (
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
                                                {filteredEstaciones.map(item => {
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
                                )}
                                
                                {/* level 2 Bancos expandable */}
                                {filteredBancos.length > 0 && (
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
                                                {filteredBancos.map(item => {
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
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Expandable Security Menu */}
                    {filteredSecurity.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button 
                                className="nav-item" 
                                onClick={() => setOpenSecurity(!openSecurity)}
                                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Shield size={20} />
                                    Seguridad
                                </div>
                                {openSecurity ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            
                            {openSecurity && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredSecurity.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredSystem.map(item => renderNavItem(item))}
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
