import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Folder, ChevronDown, ChevronRight, ChevronLeft, Shield, FileText, UserCircle, LayoutDashboard, Database, Mail, Settings as SettingsIcon } from 'lucide-react';
import { mainNavItems, catalogItems, bancosMenu, operacionesMenu, consultasItemsRoot, consultasEstaciones, consultasBancos, securityItems, systemNavItems, configuracionMenu } from '../config/navigation';

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [openCatalogs, setOpenCatalogs] = useState(false);
    const [openConsultas, setOpenConsultas] = useState(false);
    const [openConsultasEstaciones, setOpenConsultasEstaciones] = useState(false);
    const [openConsultasBancos, setOpenConsultasBancos] = useState(false);
    const [openSecurity, setOpenSecurity] = useState(false);
    const [openOperaciones, setOpenOperaciones] = useState(false);
    const [openBancos, setOpenBancos] = useState(false);
    const [openConfiguracion, setOpenConfiguracion] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const hasPermission = (path) => user.role_id === 1 || user.permissions?.includes(path);

    const [filteredConfiguracion, setFilteredConfiguracion] = useState(configuracionMenu); // Or filter by permission if needed
    
    const filteredCatalogs = catalogItems.filter(item => hasPermission(item.path));
    const filteredOperaciones = operacionesMenu.filter(item => hasPermission(item.path));
    const filteredBancosMenu = bancosMenu.filter(item => hasPermission(item.path));
    const filteredEstaciones = consultasEstaciones.filter(item => hasPermission(item.path));
    const filteredBancos = consultasBancos.filter(item => hasPermission(item.path));
    const filteredSecurity = securityItems.filter(item => hasPermission(item.path));
    const filteredSystem = systemNavItems.filter(item => hasPermission(item.path));
    const filteredConfiguracionMenu = configuracionMenu.filter(item => hasPermission(item.path));
    const hasAnyConsultas = consultasItemsRoot.some(item => hasPermission(item.path)) || filteredEstaciones.length > 0 || filteredBancos.length > 0;
    
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    useEffect(() => {
        if (securityItems.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenSecurity(true);
        if (catalogItems.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenCatalogs(true);
        if (bancosMenu.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenBancos(true);
        if (operacionesMenu.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenOperaciones(true);
        if ([...consultasItemsRoot, ...consultasEstaciones, ...consultasBancos].some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenConsultas(true);
        if (consultasBancos.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenConsultasBancos(true);
        if (consultasEstaciones.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenConsultasEstaciones(true);
        if (configuracionMenu.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))) setOpenConfiguracion(true);
    }, [location.pathname]);

    const renderNavItem = (item, isSubItem = false) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'));
        if (item.path === '/dashboard' && location.pathname !== '/dashboard') return null; // Prevent duplicate dashboard home in submenus
        
        return (
            <Link
                key={item.name}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={isSubItem ? { paddingLeft: isCollapsed ? '0.75rem' : '2.5rem', fontSize: '0.9rem' } : {}}
                title={isCollapsed ? item.name : ''}
            >
                <Icon size={isSubItem ? 18 : 20} />
                {!isCollapsed && <span>{item.name}</span>}
            </Link>
        );
    };

    return (
        <div className={`dashboard-layout ${isCollapsed ? 'collapsed' : ''}`}>
            <aside className="sidebar">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: '0.5rem 0', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {!isCollapsed && <h2 style={{ margin: 0, fontSize: '1.25rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>SIPE ADMIN</h2>}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={isCollapsed ? "Expandir" : "Contraer"}
                    >
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
                    {/* Hardcoded Dashboard Home for better control */}
                    <Link to="/dashboard" className={`nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`} title={isCollapsed ? "Dashboard" : ""}>
                        <LayoutDashboard size={20} />
                        {!isCollapsed && <span>Dashboard</span>}
                    </Link>

                    {filteredCatalogs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenCatalogs(!openCatalogs)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Catálogos" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <Folder size={20} />
                                    {!isCollapsed && <span>Catálogos</span>}
                                </div>
                                {!isCollapsed && (openCatalogs ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openCatalogs && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredCatalogs.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredOperaciones.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenOperaciones(!openOperaciones)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Operaciones" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <Folder size={20} />
                                    {!isCollapsed && <span>Operaciones</span>}
                                </div>
                                {!isCollapsed && (openOperaciones ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openOperaciones && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredOperaciones.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredBancosMenu.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenBancos(!openBancos)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Bancos" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <Folder size={20} />
                                    {!isCollapsed && <span>Bancos</span>}
                                </div>
                                {!isCollapsed && (openBancos ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openBancos && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredBancosMenu.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {hasAnyConsultas && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenConsultas(!openConsultas)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Consultas" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <FileText size={20} />
                                    {!isCollapsed && <span>Consultas</span>}
                                </div>
                                {!isCollapsed && (openConsultas ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openConsultas && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {consultasItemsRoot.filter(i => hasPermission(i.path)).map(item => renderNavItem(item, true))}
                                    {filteredEstaciones.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <button className="nav-item" onClick={() => setOpenConsultasEstaciones(!openConsultasEstaciones)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <Folder size={18} />
                                                    Estaciones
                                                </div>
                                                {openConsultasEstaciones ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                            {openConsultasEstaciones && (
                                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                                    {filteredEstaciones.map(item => renderNavItem(item, true))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {filteredBancos.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <button className="nav-item" onClick={() => setOpenConsultasBancos(!openConsultasBancos)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: 'space-between', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <Folder size={18} />
                                                    Bancos
                                                </div>
                                                {openConsultasBancos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                            {openConsultasBancos && (
                                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                                    {filteredBancos.map(item => renderNavItem(item, true))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredSecurity.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenSecurity(!openSecurity)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Seguridad" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <Shield size={20} />
                                    {!isCollapsed && <span>Seguridad</span>}
                                </div>
                                {!isCollapsed && (openSecurity ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openSecurity && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredSecurity.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredConfiguracionMenu.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button className="nav-item" onClick={() => !isCollapsed && setOpenConfiguracion(!openConfiguracion)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }} title={isCollapsed ? "Configuración" : ""}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                    <SettingsIcon size={20} />
                                    {!isCollapsed && <span>Configuración</span>}
                                </div>
                                {!isCollapsed && (openConfiguracion ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                            </button>
                            {openConfiguracion && !isCollapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem', gap: '0.25rem' }}>
                                    {filteredConfiguracionMenu.map(item => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    )}
                </nav>

                <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.5rem', marginBottom: '0.5rem', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
                        <UserCircle size={isCollapsed ? 28 : 32} color="var(--primary)" />
                        {!isCollapsed && (
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-color)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.nombre || user.username || 'Usuario'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.role_id === 1 ? 'Administrador' : 'Usuario'}</div>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', color: '#ef4444', justifyContent: isCollapsed ? 'center' : 'flex-start' }} title={isCollapsed ? "Cerrar Sesión" : ""}>
                        <LogOut size={20} />
                        {!isCollapsed && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </aside>
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
