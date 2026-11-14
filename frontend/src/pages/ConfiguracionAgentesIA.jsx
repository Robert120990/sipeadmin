import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bot, Cpu, Server, Database, Network, RefreshCw, Play,
    FileText, MessageSquare, ShieldCheck, Activity, CheckCircle2, AlertTriangle, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import ReportPreviewModal from '../components/ReportPreviewModal';

export default function ConfiguracionAgentesIA() {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [controlData, setControlData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [dossierPreview, setDossierPreview] = useState({ open: false, blob: null });

    const [busquedaBitacora, setBusquedaBitacora] = useState('');
    const [filtroAutorizacion, setFiltroAutorizacion] = useState('todas');

    const fetchControlCenter = async () => {
        setLoading(true);
        try {
            const res = await api.get('/ai/agents-control-center');
            setControlData(res.data);
        } catch (error) {
            console.error('Error cargando Centro de Control de Agentes IA:', error);
            addToast('No se pudo cargar la telemetría del ecosistema de Agentes IA', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchControlCenter();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTriggerSweep = async () => {
        const ok = await confirm(
            '¿Ejecutar un barrido preventivo de mermas y descuadres en tiempo real hacia Telegram/n8n?',
            { title: 'Disparar Centinela Operativo' }
        );
        if (!ok) return;

        setTriggering(true);
        try {
            const res = await api.post('/ai/webhooks/trigger', { event: 'discrepancy_check' });
            const msg = res.data?.message || 'Barrido preventivo ejecutado correctamente';
            addToast(msg, 'success');
            fetchControlCenter();
        } catch (error) {
            console.error('Error disparando barrido:', error);
            addToast(error.response?.data?.message || 'Error al ejecutar barrido de alertas', 'error');
        } finally {
            setTriggering(false);
        }
    };

    const handlePreviewDossier = async () => {
        setPdfLoading(true);
        try {
            const res = await api.get('/inteligencia/dossier-ejecutivo-pdf', { responseType: 'blob' });
            const pdfBlob = new Blob([res.data], { type: 'application/pdf' });
            setDossierPreview({ open: true, blob: pdfBlob });
        } catch (error) {
            console.error('Error generando Dossier PDF:', error);
            addToast('Error al generar el Dossier Ejecutivo Semanal PDF', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    const formatDateTime = (isoOrSql) => {
        if (!isoOrSql) return 'Sin registro reciente';
        const d = new Date(isoOrSql);
        if (Number.isNaN(d.getTime())) return String(isoOrSql);
        return d.toLocaleString('es-SV', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const health = controlData?.health || {};
    const botInfo = health.bot || {};
    const dbs = health.databases || {};
    const gemini = health.gemini || {};
    const metrics = health.metrics || {};
    const feedback = health.feedbackSatisfaction || {};
    const recentErrors = health.recentErrors || [];

    const auto = controlData?.automatizaciones || {};
    const actividades = auto.actividades_programadas || [];
    const graphify = controlData?.graphify || {};
    const topNodes = graphify.topNodes || [];
    const bitacora = controlData?.bitacora_ia || [];

    const bitacoraFiltrada = bitacora.filter((row) => {
        if (filtroAutorizacion === 'autorizadas' && Number(row.autorizado) !== 1) return false;
        if (filtroAutorizacion === 'denegadas' && Number(row.autorizado) === 1) return false;
        if (busquedaBitacora.trim()) {
            const q = busquedaBitacora.toLowerCase();
            const texto = `${row.comando || ''} ${row.consulta || ''} ${row.first_name || ''} ${row.telegram_username || ''}`.toLowerCase();
            return texto.includes(q);
        }
        return true;
    });

    const isHealthy = health.status === 'healthy';
    const statusColor = isHealthy ? '#10b981' : health.status === 'critical' ? '#ef4444' : '#f59e0b';
    const statusLabel = isHealthy ? 'SALUDABLE' : health.status === 'critical' ? 'CRÍTICO' : 'DEGRADADO';

    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <Bot size={22} color="#3b82f6" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
                                Centro de Control de Agentes IA, OpenClaw & Graphify
                            </h1>
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                backgroundColor: `${statusColor}22`,
                                color: statusColor
                            }}>
                                {loading ? 'VERIFICANDO...' : statusLabel}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Orquestación de dos servidores (5.252.55.29 ↔ {auto.servidor_agentes_ip || '169.58.207.115'}), telemetría Telegram y grafo determinista AST
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard/consultas/ia-asistente')}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <MessageSquare size={15} /> Asistente Web
                    </button>
                    <button
                        type="button"
                        onClick={handlePreviewDossier}
                        disabled={pdfLoading}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileText size={15} /> {pdfLoading ? 'Generando...' : 'Dossier PDF'}
                    </button>
                    <button
                        type="button"
                        onClick={handleTriggerSweep}
                        disabled={triggering}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Play size={14} /> {triggering ? 'Ejecutando...' : 'Barrido Alertas'}
                    </button>
                    <button
                        type="button"
                        onClick={fetchControlCenter}
                        className="btn btn-primary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Actualizar
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
                gap: '0.85rem'
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: `4px solid ${statusColor}` }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Bases Transaccionales (SELECT)
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        {dbs.sipeAdmin?.connected ? 'SIPE OK' : 'SIPE OFF'} • {dbs.sistemaSaas?.connected ? 'SAAS OK' : 'SAAS OFF'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Latencia: {dbs.sipeAdmin?.latencyMs ?? 0}ms / {dbs.sistemaSaas?.latencyMs ?? 0}ms • Cero escritura
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Gateway Telegram & Gemini
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.2rem' }}>
                        {botInfo.username || 'Bot SIPE'} • {auto.usuarios_telegram_activos || 0} activos
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {gemini.configured ? `IA: ${gemini.model || 'gemini-2.0-flash'}` : 'Motor determinista SQL'} • Polling {botInfo.isPolling ? 'ON' : 'Standby'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Grafo Conocimiento Graphify
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '0.2rem' }}>
                        {(graphify.nodesCount || 0).toLocaleString()} nodos • {(graphify.edgesCount || 0).toLocaleString()} aristas
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.15rem' }}>
                        {graphify.communitiesCount || 0} comunidades • 0 ciclos CJS verificados
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Rendimiento & Satisfacción IA
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.2rem' }}>
                        {feedback.satisfactionRatePct ?? 100}% útil • {metrics.averageResponseTimeMs || 0} ms
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {metrics.totalQueriesReceived || 0} consultas • {metrics.voiceNotesProcessed || 0} notas de voz
                    </div>
                </div>
            </div>

            {/* Arquitectura de Dos Servidores y Sincronizaciones */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: '0.85rem'
            }}>
                <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <Database size={17} color="#10b981" /> Nodo Producción Principal (5.252.55.29)
                        </h3>
                        <span style={{
                            fontSize: '0.7rem',
                            padding: '0.12rem 0.42rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981'
                        }}>
                            PROTECCIÓN ACTIVA
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>API Gateway IA:</span>
                            <code>POST /api/ai/query • timeout 10s</code>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Política de Base de Datos:</span>
                            <span style={{ fontWeight: 600, color: '#10b981' }}>Solo Lectura Estricta (SELECT)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Herencia de Permisos:</span>
                            <span>RBAC SIPE ↔ Usuarios Telegram</span>
                        </div>
                        <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => navigate('/dashboard/seguridad/telegram')}
                                className="btn btn-secondary"
                                style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <ShieldCheck size={14} /> Gestionar Usuarios Telegram
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <Server size={17} color="#3b82f6" /> Nodo Automatización & OpenClaw ({auto.servidor_agentes_ip || '169.58.207.115'})
                        </h3>
                        <span style={{
                            fontSize: '0.7rem',
                            padding: '0.12rem 0.42rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            color: '#3b82f6'
                        }}>
                            DESACOPLADO
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Gateway OpenClaw:</span>
                            <span style={{ fontWeight: 600 }}>{auto.openclaw_custom_url || auto.openclaw_gateway || 'https://bot.how2getfun.com'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Última Sync Portal Puma:</span>
                            <span>{formatDateTime(auto.portal_puma_last_sync)} ({auto.portal_puma_ordenes_24h || 0} órd. 24h)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Última Sync Precios DGEHM:</span>
                            <span>{formatDateTime(auto.dgehm_precios_last_sync)} ({auto.dgehm_estaciones_monitoreadas || 0} est.)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Última Actualización AST:</span>
                            <span>{formatDateTime(graphify.lastUpdatedAt)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Catálogo de Actividades Programadas n8n / Crons + Nodos Clave Graphify */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '0.85rem'
            }}>
                <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.7rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Cpu size={18} color="#8b5cf6" /> Flujos Programados n8n y Crons Remotos
                    </h3>
                    <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '540px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>FLUJO AUTOMATIZADO</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>FRECUENCIA</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actividades.map((act) => (
                                    <tr key={act.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <div style={{ fontWeight: 600 }}>{act.nombre}</div>
                                            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>{act.motor}</div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.76rem' }}>{act.horario}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <span style={{
                                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                color: '#10b981',
                                                fontSize: '0.72rem',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontWeight: 700,
                                                display: 'inline-block'
                                            }}>
                                                ACTIVO
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Network size={18} color="#3b82f6" /> Nodos Centrales del Grafo AST (Graphify)
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Top módulos por grado de conexión
                        </span>
                    </div>
                    <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>NODO / ENTIDAD</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ARCHIVO FUENTE</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>CONEXIONES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topNodes.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            Grafo AST pendiente de indexación local.
                                        </td>
                                    </tr>
                                ) : (
                                    topNodes.slice(0, 6).map((nd) => (
                                        <tr key={nd.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{nd.label}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                {nd.source_file || 'Módulo interno'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>
                                                {nd.degree}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Bitácora de Consultas IA (Telegram & Gateway) */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Activity size={18} color="#10b981" /> Bitácora Reciente de Consultas de Agentes IA y Telegram
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Filtrar usuario o pregunta..."
                            value={busquedaBitacora}
                            onChange={(e) => setBusquedaBitacora(e.target.value)}
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', width: '210px' }}
                        />
                        <select
                            value={filtroAutorizacion}
                            onChange={(e) => setFiltroAutorizacion(e.target.value)}
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                        >
                            <option value="todas">Todas ({bitacora.length})</option>
                            <option value="autorizadas">Autorizadas</option>
                            <option value="denegadas">Bloqueadas RBAC</option>
                        </select>
                    </div>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>FECHA / HORA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>USUARIO TELEGRAM</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>INTENCIÓN / COMANDO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>CONSULTA PROCESADA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ACCESO RBAC</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Cargando bitácora de interacciones IA...
                                    </td>
                                </tr>
                            ) : bitacoraFiltrada.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No hay registros de consultas IA que coincidan con el filtro actual.
                                    </td>
                                </tr>
                            ) : (
                                bitacoraFiltrada.map((row) => {
                                    const authOk = Number(row.autorizado) === 1;
                                    const userLabel = row.first_name
                                        ? `${row.first_name}${row.telegram_username ? ` (@${row.telegram_username})` : ''}`
                                        : (row.telegram_username ? `@${row.telegram_username}` : `ID ${row.telegram_user_id}`);
                                    return (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                {formatDateTime(row.created_at)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{userLabel}</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <code>{row.comando || 'texto_libre'}</code>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {row.consulta || '—'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    backgroundColor: authOk ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: authOk ? '#10b981' : '#ef4444',
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem'
                                                }}>
                                                    {authOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                    {authOk ? 'AUTORIZADO' : 'DENEGADO'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {recentErrors.length > 0 && (
                    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <AlertTriangle size={14} /> Eventos Forenses Recientes en Memoria ({recentErrors.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {recentErrors.slice(0, 4).map((err) => (
                                <div key={err.id} style={{
                                    fontSize: '0.75rem',
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.07)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '0.5rem',
                                    flexWrap: 'wrap'
                                }}>
                                    <span><strong>[{err.type}]</strong> {err.message}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(err.timestamp)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <ReportPreviewModal
                isOpen={dossierPreview.open}
                onClose={() => setDossierPreview({ open: false, blob: null })}
                title="Dossier Ejecutivo Semanal — Grupo SIPE"
                subtitle="Compilado Ejecutivo Automático (EBITDA Real, Bancos, Abastecimiento Puma y Auditoría)"
                badge="CARTA OFICIAL"
                icon={ExternalLink}
                pdfSource={dossierPreview.blob}
                fileName={`Dossier_Ejecutivo_SIPE_${todayStr}.pdf`}
                totalPages={1}
                footerInfo="Documento Ejecutivo Confidencial — Formato Carta Estándar (215.9mm x 279.4mm)"
            />
        </div>
    );
}
