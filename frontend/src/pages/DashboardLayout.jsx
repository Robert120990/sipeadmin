import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Folder, ChevronDown, ChevronRight, ChevronLeft, Shield, FileText, UserCircle, LayoutDashboard, Settings as SettingsIcon, X, Sun, Moon, Menu as MenuIcon, Home, MoreHorizontal } from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { useViewport } from '../hooks/useViewport';
import { catalogItems, bancosMenu, operacionesMenu, consultasItemsRoot, consultasEstaciones, consultasBancos, consultasOtras, securityItems, configuracionMenu } from '../config/navigation';

// Import All Page Components for Tab Rendering
import Dashboard from './Dashboard';
import Users from './Users';
import Carriers from './Carriers';
import Tankers from './Tankers';
import Consultas from './Consultas';
import VentasEstaciones from './VentasEstaciones';
import Lubricantes from './Lubricantes';
import ResumenPista from './ResumenPista';
import DiferenciasCombustible from './DiferenciasCombustible';
import ConsultasPreciosCompetencia from './ConsultasPreciosCompetencia';
import PedidosCombustible from './PedidosCombustible';
import ControlRecordatorios from './ControlRecordatorios';
import Permissions from './Permissions';
import CuentasBancarias from './CuentasBancarias';
import ConfiguracionDb from './ConfiguracionDb';
import ConfiguracionEmail from './ConfiguracionEmail';
import ConfiguracionContabilidad from './ConfiguracionContabilidad';
import ConsultasCumpleanos from './ConsultasCumpleanos';
import MovimientosBancarios from './MovimientosBancarios';
import ConciliacionBancaria from './ConciliacionBancaria';
import Cheques from './Cheques';
import ChequesContado from './ChequesContado';
import CheckDesigner from './CheckDesigner';
import BackupDBCheck from './BackupDBCheck';
import Bitacora from './Bitacora';
import pkg from '../../package.json';

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { isMobile } = useViewport();
    
    // UI State
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [openMenus, setOpenMenus] = useState({
        catalogs: false,
        consultas: false,
        consultasEstaciones: false,
        consultasBancos: false,
        consultasOtras: false,
        security: false,
        operaciones: false,
        bancos: false,
        configuracion: false
    });

    // Tabs State
    const [tabs, setTabs] = useState([
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }
    ]);
    const [activeTabPath, setActiveTabPath] = useState('/dashboard');

    // Mobile UI State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const hasPermission = (path) => user.role_id === 1 || user.role === 'Administrator' || user.role_name === 'Administrator' || user.permissions?.includes(path);

    // Component Registry Mapping
    const componentRegistry = {
        '/dashboard': <Dashboard />,
        '/dashboard/users': <Users />,
        '/dashboard/carriers': <Carriers />,
        '/dashboard/tankers': <Tankers />,
        '/dashboard/consultas/estaciones': <div className="card glass"><h1>Estaciones</h1><p>Módulo de estaciones (Próximamente).</p></div>,
        '/dashboard/consultas/estaciones/ventas': <VentasEstaciones />,
        '/dashboard/consultas/estaciones/lubricantes': <Lubricantes />,
        '/dashboard/consultas/estaciones/resumen-cierre': <ResumenPista />,
        '/dashboard/consultas/estaciones/diferencias-combustible': <DiferenciasCombustible />,
        '/dashboard/consultas/estaciones/precios': <Consultas type="estaciones/precios" title="Precios Estación" description="Consulta de precios actuales en estaciones." />,
        '/dashboard/consultas/estaciones/precios-competencia': <ConsultasPreciosCompetencia />,
        '/dashboard/operaciones/pedidos': <PedidosCombustible />,
        '/dashboard/operaciones/recordatorios': <ControlRecordatorios />,
        '/dashboard/consultas/saldos-bancos': <Consultas type="saldos-bancos" title="Saldos en Bancos" description="Reporte de saldos consolidados en bancos." />,
        '/dashboard/consultas/saldos-chequera': <Consultas type="saldos-chequera" title="Saldos en Chequera" description="Reporte de saldos en chequeras a la fecha actual." />,
        '/dashboard/consultas/otras/cumpleanos': <ConsultasCumpleanos />,
        '/dashboard/bancos/cuentas': <CuentasBancarias />,
        '/dashboard/bancos/movimientos': <MovimientosBancarios />,
        '/dashboard/bancos/conciliacion': <ConciliacionBancaria />,
        '/dashboard/bancos/cheques': <Cheques />,
        '/dashboard/bancos/cheques-contado': <ChequesContado />,
        '/dashboard/bancos/check-designer': <CheckDesigner />,
        '/dashboard/consultas/otras/backup-db-check': <BackupDBCheck />,
        '/dashboard/settings/database': <ConfiguracionDb />,
        '/dashboard/settings/accounting': <ConfiguracionContabilidad />,
        '/dashboard/settings/email': <ConfiguracionEmail />,
        '/dashboard/permissions': <Permissions />,
        '/dashboard/bitacora': <Bitacora />,
    };

    // Sync with URL location
    useEffect(() => {
        // Find the module in any of our navigation lists
        const allNavItems = [
            ...catalogItems, 
            ...operacionesMenu, 
            ...bancosMenu, 
            ...consultasItemsRoot, 
            ...consultasEstaciones, 
            ...consultasBancos, 
            ...consultasOtras, 
            ...securityItems, 
            ...configuracionMenu
        ];
        
        let item = allNavItems.find(i => i.path === location.pathname);
        // Rutas hijas (ej. check-designer/edit/1): abrir el tab del módulo padre
        if (!item) {
            item = allNavItems
                .filter(i => location.pathname.startsWith(i.path + '/'))
                .sort((a, b) => b.path.length - a.path.length)[0];
        }
        if (item) {
            // Abrir el tab SIN navegar (preserva la URL actual, p. ej. /edit/:formatId)
            if (isMobile) {
                setTabs([{ name: item.name, path: item.path, icon: item.icon || FileText }]);
            } else {
                setTabs(prev => prev.find(t => t.path === item.path) ? prev : [...prev, { name: item.name, path: item.path, icon: item.icon || FileText }]);
            }
            setActiveTabPath(item.path);
            setDrawerOpen(false);
        } else if (location.pathname === '/dashboard') {
            setActiveTabPath('/dashboard');
        }
    }, [location.pathname, isMobile]);

    // Android back: close mobile overlays before leaving the app
    useEffect(() => {
        const onPopState = () => {
            setDrawerOpen(false);
            setMoreOpen(false);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const openTab = (item) => {
        if (isMobile) {
            // Mobile: single active view — the new module replaces the current one
            setTabs([{ name: item.name, path: item.path, icon: item.icon || FileText }]);
        } else {
            setTabs(prev => {
                if (prev.find(t => t.path === item.path)) return prev;
                return [...prev, { name: item.name, path: item.path, icon: item.icon || FileText }];
            });
        }
        setActiveTabPath(item.path);
        setDrawerOpen(false);
        if (location.pathname !== item.path) {
            navigate(item.path);
        }
    };

    const closeTab = (e, path) => {
        e.stopPropagation();
        if (path === '/dashboard') return;

        const newTabs = tabs.filter(t => t.path !== path);
        setTabs(newTabs);

        if (activeTabPath === path) {
            const nextTab = newTabs[newTabs.length - 1];
            setActiveTabPath(nextTab.path);
            navigate(nextTab.path);
        }
    };

    // Mobile overlays: push a history state so Android back closes them first
    const openDrawer = () => {
        setDrawerOpen(true);
        window.history.pushState({ overlay: 'drawer' }, '');
    };

    const openMore = () => {
        setMoreOpen(true);
        window.history.pushState({ overlay: 'more' }, '');
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        if (window.history.state?.overlay) window.history.back();
    };

    const closeMore = () => {
        setMoreOpen(false);
        if (window.history.state?.overlay) window.history.back();
    };

    // Filtered Menus
    const getFiltered = (menu) => menu.filter(item => hasPermission(item.path));
    
    const filteredCatalogs = getFiltered(catalogItems);
    const filteredOperaciones = getFiltered(operacionesMenu);
    const filteredBancosMenu = getFiltered(bancosMenu);
    const filteredEstaciones = getFiltered(consultasEstaciones);
    const filteredBancos = getFiltered(consultasBancos);
    const filteredOtras = getFiltered(consultasOtras);
    const filteredSecurity = getFiltered(securityItems);
    const filteredConfiguracionMenu = getFiltered(configuracionMenu);

    const toggleMenu = (key) => {
        if (isCollapsed) return;
        setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const renderNavItem = (item, isSubItem = false) => {
        const Icon = item.icon || FileText;
        const isActive = activeTabPath === item.path;
        
        return (
            <div
                key={item.name}
                onClick={() => openTab(item)}
                className={`nav-item ${isActive ? 'active' : ''}`}
                style={{ 
                    cursor: 'pointer',
                    paddingLeft: isSubItem && !isCollapsed ? '2.5rem' : '0.75rem', 
                    fontSize: isSubItem ? '0.9rem' : '1rem' 
                }}
                title={isCollapsed ? item.name : ''}
            >
                <Icon size={isSubItem ? 18 : 20} />
                {!isCollapsed && <span>{item.name}</span>}
            </div>
        );
    };

    const renderNavSections = (variant) => {
        const navClassName = variant === 'drawer' ? 'drawer-nav' : 'sidebar-nav';
        return (
            <nav className={navClassName} style={variant === 'drawer' ? undefined : { flex: 1, overflowY: 'auto' }}>
                {renderNavItem({ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard })}

                {filteredCatalogs.length > 0 && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('catalogs')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <Folder size={20} />
                                {!isCollapsed && <span>Catálogos</span>}
                            </div>
                            {!isCollapsed && (openMenus.catalogs ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.catalogs && !isCollapsed && filteredCatalogs.map(item => renderNavItem(item, true))}
                    </div>
                )}

                {filteredOperaciones.length > 0 && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('operaciones')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <Folder size={20} />
                                {!isCollapsed && <span>Operaciones</span>}
                            </div>
                            {!isCollapsed && (openMenus.operaciones ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.operaciones && !isCollapsed && filteredOperaciones.map(item => renderNavItem(item, true))}
                    </div>
                )}

                {filteredBancosMenu.length > 0 && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('bancos')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <Folder size={20} />
                                {!isCollapsed && <span>Bancos</span>}
                            </div>
                            {!isCollapsed && (openMenus.bancos ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.bancos && !isCollapsed && filteredBancosMenu.map(item => renderNavItem(item, true))}
                    </div>
                )}

                {/* Consultas Section */}
                {(filteredEstaciones.length > 0 || filteredBancos.length > 0 || filteredOtras.length > 0) && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('consultas')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <FileText size={20} />
                                {!isCollapsed && <span>Consultas</span>}
                            </div>
                            {!isCollapsed && (openMenus.consultas ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.consultas && !isCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {/* Estaciones Submenu */}
                                {filteredEstaciones.length > 0 && (
                                    <div>
                                        <button className="nav-item" onClick={() => toggleMenu('consultasEstaciones')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            <span>Estaciones</span>
                                            {openMenus.consultasEstaciones ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {openMenus.consultasEstaciones && filteredEstaciones.map(item => renderNavItem(item, true))}
                                    </div>
                                )}
                                {/* Bancos Submenu */}
                                {filteredBancos.length > 0 && (
                                    <div>
                                        <button className="nav-item" onClick={() => toggleMenu('consultasBancos')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            <span>Bancos</span>
                                            {openMenus.consultasBancos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {openMenus.consultasBancos && filteredBancos.map(item => renderNavItem(item, true))}
                                    </div>
                                )}
                                {/* Otras Submenu */}
                                {filteredOtras.length > 0 && (
                                    <div>
                                        <button className="nav-item" onClick={() => toggleMenu('consultasOtras')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', paddingLeft: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            <span>Otras</span>
                                            {openMenus.consultasOtras ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        {openMenus.consultasOtras && filteredOtras.map(item => renderNavItem(item, true))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {filteredSecurity.length > 0 && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('security')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <Shield size={20} />
                                {!isCollapsed && <span>Seguridad</span>}
                            </div>
                            {!isCollapsed && (openMenus.security ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.security && !isCollapsed && filteredSecurity.map(item => renderNavItem(item, true))}
                    </div>
                )}

                {filteredConfiguracionMenu.length > 0 && (
                    <div>
                        <button className="nav-item" onClick={() => toggleMenu('configuracion')} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '0.75rem' }}>
                                <SettingsIcon size={20} />
                                {!isCollapsed && <span>Configuración</span>}
                            </div>
                            {!isCollapsed && (openMenus.configuracion ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                        </button>
                        {openMenus.configuracion && !isCollapsed && filteredConfiguracionMenu.map(item => renderNavItem(item, true))}
                    </div>
                )}
            </nav>
        );
    };

    const renderContent = () => (
        <div className="tab-content-container">
            {tabs.map(tab => (
                <div 
                    key={tab.path} 
                    className={`tab-panel ${activeTabPath === tab.path ? 'active' : ''}`}
                >
                    {hasPermission(tab.path) || tab.path === '/dashboard' ? (
                        componentRegistry[tab.path] || <div className="card glass">Módulo no registrado: {tab.path}</div>
                    ) : (
                        <div className="card glass" style={{ textAlign: 'center', padding: '3rem' }}>
                            <Shield size={48} color="var(--danger)" style={{ marginBottom: '1rem' }} />
                            <h2>Acceso Restringido</h2>
                            <p>No tiene permisos suficientes para ver el módulo {tab.path}.</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    // ─────────────── Desktop Shell (sidebar + tabs) ───────────────
    const desktopShell = (
        <div className={`dashboard-layout ${isCollapsed ? 'collapsed' : ''}`}>
            <aside className="sidebar">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: '0.5rem 0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                    {!isCollapsed && <h2 style={{ margin: 0, fontSize: '1.25rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>SIPE ADMIN</h2>}
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                            onClick={toggleTheme}
                            style={{ background: 'var(--hover-bg)', border: 'none', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                        >
                            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            style={{ background: 'var(--hover-bg)', border: 'none', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                        </button>
                    </div>
                </div>

                {renderNavSections('sidebar')}

                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
                        <UserCircle size={isCollapsed ? 28 : 32} color="var(--primary)" />
                        {!isCollapsed && (
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{user.nombre || user.username}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.role_id === 1 ? 'Administrador' : 'Usuario'}</div>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', color: '#ef4444' }}>
                        <LogOut size={20} />
                        {!isCollapsed && <span>Cerrar Sesión</span>}
                    </button>
                    {!isCollapsed && (
                        <div style={{ padding: '0.1rem 0.1rem', textAlign: 'center', fontSize: '1rem', fontWeight: 500, color: 'var(--primary)', opacity: 0.9 }}>
                            version: {pkg.version}
                        </div>
                    )}
                </div>
            </aside>

            <main className="main-content">
                <div className="tabs-bar">
                    {tabs.map(tab => {
                        const Icon = tab.icon || FileText;
                        return (
                            <div 
                                key={tab.path} 
                                className={`tab-item ${activeTabPath === tab.path ? 'active' : ''}`}
                                onClick={() => setActiveTabPath(tab.path)}
                            >
                                <Icon size={14} />
                                <span>{tab.name}</span>
                                {tab.path !== '/dashboard' && (
                                    <div className="tab-close" onClick={(e) => closeTab(e, tab.path)}>
                                        <X size={12} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {renderContent()}
            </main>
        </div>
    );

    // ─────────────── Mobile Shell (single active view) ───────────────
    const currentTab = tabs.find(t => t.path === activeTabPath);
    const headerTitle = activeTabPath === '/dashboard' ? 'SIPE Admin' : (currentTab?.name || 'SIPE Admin');

    const mobileShell = (
        <div className="mobile-shell">
            <header className="mobile-header">
                <button className="header-btn" onClick={openDrawer} aria-label="Abrir menú">
                    <MenuIcon size={22} />
                </button>
                <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
                    <div className="header-title">{headerTitle}</div>
                </div>
                <button className="header-btn" onClick={openMore} aria-label="Más opciones">
                    <MoreHorizontal size={22} />
                </button>
            </header>

            <main className="main-content">
                {renderContent()}
            </main>

            <nav className="bottom-nav">
                <button className={activeTabPath === '/dashboard' ? 'active' : ''} onClick={() => openTab({ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard })}>
                    <Home size={20} />
                    <span>Inicio</span>
                </button>
                <button onClick={openDrawer}>
                    <MenuIcon size={20} />
                    <span>Menú</span>
                </button>
                <button onClick={openMore}>
                    <MoreHorizontal size={20} />
                    <span>Más</span>
                </button>
            </nav>

            {drawerOpen && (
                <div className="drawer-overlay" onClick={closeDrawer}>
                    <div className="drawer" onClick={e => e.stopPropagation()}>
                        <div className="drawer-header">
                            <h2 style={{ margin: 0, color: 'var(--primary)' }}>SIPE Admin</h2>
                            <button className="header-btn" onClick={closeDrawer} aria-label="Cerrar menú">
                                <X size={20} />
                            </button>
                        </div>
                        {renderNavSections('drawer')}
                        <div className="drawer-footer">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.25rem' }}>
                                <UserCircle size={32} color="var(--primary)" />
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{user.nombre || user.username}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.role_id === 1 ? 'Administrador' : 'Usuario'}</div>
                                </div>
                            </div>
                            <button onClick={handleLogout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', color: '#ef4444' }}>
                                <LogOut size={20} />
                                <span>Cerrar Sesión</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {moreOpen && (
                <div className="more-sheet-overlay" onClick={closeMore}>
                    <div className="more-sheet" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <UserCircle size={40} color="var(--primary)" />
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{user.nombre || user.username}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.role_id === 1 ? 'Administrador' : 'Usuario'}</div>
                            </div>
                        </div>
                        <button className="sheet-item" onClick={toggleTheme}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                        </button>
                        <button className="sheet-item danger" onClick={handleLogout}>
                            <LogOut size={18} />
                            Cerrar Sesión
                        </button>
                        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--primary)', opacity: 0.9, marginTop: '0.75rem', fontWeight: 500 }}>
                            version: {pkg.version}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return isMobile ? mobileShell : desktopShell;
}
