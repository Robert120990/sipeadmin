import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Folder, ChevronDown, ChevronRight, ChevronLeft, Shield, FileText, UserCircle, LayoutDashboard, Settings as SettingsIcon, X } from 'lucide-react';
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

export default function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    
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

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const hasPermission = (path) => user.role_id === 1 || user.permissions?.includes(path);

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
        '/dashboard/settings/database': <ConfiguracionDb />,
        '/dashboard/settings/accounting': <ConfiguracionContabilidad />,
        '/dashboard/settings/email': <ConfiguracionEmail />,
        '/dashboard/permissions': <Permissions />,
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
        
        const item = allNavItems.find(i => i.path === location.pathname);
        if (item) {
            openTab(item);
        } else if (location.pathname === '/dashboard') {
            setActiveTabPath('/dashboard');
        }
    }, [location.pathname]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const openTab = (item) => {
        if (!tabs.find(t => t.path === item.path)) {
            setTabs(prev => [...prev, { name: item.name, path: item.path, icon: item.icon || FileText }]);
        }
        setActiveTabPath(item.path);
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

    return (
        <div className={`dashboard-layout ${isCollapsed ? 'collapsed' : ''}`}>
            <aside className="sidebar">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: '0.5rem 0', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {!isCollapsed && <h2 style={{ margin: 0, fontSize: '1.25rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>SIPE ADMIN</h2>}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
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

                <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
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
            </main>
        </div>
    );
}
