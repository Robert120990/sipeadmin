import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    HardDrive, Server, Database, Plus, RefreshCw, Play, PlugZap,
    Terminal, Edit2, Trash2, Download, FileText, FolderOpen,
    CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck,
    Copy, Check, KeyRound, Eye, EyeOff, ArrowRightLeft, Info
} from 'lucide-react';
import api from '../services/api';
import socket from '../services/socket';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';

const MODE_OPTIONS = [
    {
        value: 'synology_pull',
        label: 'Agente Pull Synology DSM (Recomendado para LAN sin abrir puertos)',
        shortLabel: 'Agente Pull (HTTPS)',
        defaultPort: 5001
    },
    {
        value: 'synology_dsm',
        label: 'Push directo — Synology DSM FileStation API (HTTPS :5001 / HTTP :5000)',
        shortLabel: 'Synology DSM API',
        defaultPort: 5001
    },
    {
        value: 'webdav',
        label: 'Push directo — WebDAV Synology (HTTPS :5006 / HTTP :5005)',
        shortLabel: 'WebDAV',
        defaultPort: 5006
    },
    {
        value: 'sftp',
        label: 'Push directo — SFTP / SSH (:22)',
        shortLabel: 'SFTP / SSH',
        defaultPort: 22
    },
    {
        value: 'local_mount',
        label: 'Carpeta Montada Local (SMB / NFS en el servidor)',
        shortLabel: 'Montaje Local',
        defaultPort: 0
    }
];

const NAS_TYPE_OPTIONS = [
    { value: 'synology', label: 'Synology NAS (DSM 6 / DSM 7)' },
    { value: 'qnap', label: 'QNAP NAS (QTS)' },
    { value: 'truenas', label: 'TrueNAS / FreeNAS' },
    { value: 'linux_sftp', label: 'Servidor Linux / SFTP' },
    { value: 'webdav_generico', label: 'WebDAV Genérico' }
];

const FREQUENCY_OPTIONS = [
    { value: 'daily', label: 'Diario (02:00 AM)', cron: '0 2 * * *' },
    { value: 'every_12h', label: 'Cada 12 horas', cron: '0 */12 * * *' },
    { value: 'every_6h', label: 'Cada 6 horas', cron: '0 */6 * * *' },
    { value: 'weekly', label: 'Semanal (Domingo 03:00 AM)', cron: '0 3 * * 0' },
    { value: 'manual', label: 'Solo ejecución manual', cron: '' },
    { value: 'custom', label: 'Expresión Cron personalizada', cron: '0 2 * * *' }
];

const EMPTY_FORM = {
    nombre: 'Synology NAS Oficina',
    tipo_nas: 'synology',
    modo_conexion: 'synology_pull',
    host_lan: '192.168.31.222',
    host_remoto: '',
    puerto: 5001,
    usar_ssl: true,
    permitir_cert_autofirmado: true,
    usuario: 'raulsosa',
    password: '',
    ssh_private_key: '',
    ruta_destino: '/volume1/backups/sipe-db',
    servidor_origen_ip: '5.252.55.29',
    respaldar_todas: true,
    bases_datos: [],
    programacion_activa: true,
    frecuencia: 'daily',
    cron_expresion: '0 2 * * *',
    retencion_dias: 30,
    notificar_telegram: true,
    es_principal: false,
    activo: true,
    notas: ''
};

function formatBytes(bytes) {
    const num = Number(bytes || 0);
    if (!Number.isFinite(num) || num <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
    return `${(num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatDateTime(val) {
    if (!val) return 'Sin registro';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString('es-SV', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDuration(ms) {
    const n = Number(ms || 0);
    if (n <= 0) return '-';
    if (n < 1000) return `${n} ms`;
    return `${(n / 1000).toFixed(1)} s`;
}

function isPrivateIpClient(host) {
    if (!host) return false;
    const clean = String(host).trim().toLowerCase();
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|localhost)/.test(clean);
}

function getStatusBadgeMeta(status) {
    switch (String(status || '').toLowerCase()) {
        case 'online':
        case 'completado':
        case 'ok':
            return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', label: status === 'online' ? 'EN LÍNEA' : status === 'ok' ? 'OK' : 'COMPLETADO', icon: CheckCircle2 };
        case 'warning':
        case 'parcial':
        case 'pendiente':
            return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', label: String(status).toUpperCase(), icon: Clock };
        case 'en_progreso':
            return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)', label: 'EN PROGRESO', icon: RefreshCw };
        case 'offline':
        case 'error':
            return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)', label: String(status).toUpperCase(), icon: XCircle };
        default:
            return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)', label: String(status || 'PENDIENTE').toUpperCase(), icon: AlertTriangle };
    }
}

export default function ControlNAS() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState({
        servers: [],
        sourceServer: { ip: '5.252.55.29', totalDatabases: 0, totalSizeMb: 0, mysqlVersion: '' },
        databases: [],
        recentLogs: [],
        schedulerStatus: { activeCronJobs: 0, timezone: 'America/El_Salvador', runningJobs: [] }
    });
    const [activeTab, setActiveTab] = useState('servers'); // 'servers' | 'databases' | 'logs' | 'files'

    // Action loading states
    const [testingId, setTestingId] = useState(null);
    const [runningBackupId, setRunningBackupId] = useState(null);
    const [downloadingDb, setDownloadingDb] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfPreview, setPdfPreview] = useState({ open: false, blob: null });

    // Add / Edit NAS Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // Synology Setup Wizard Modal
    const [scriptModalOpen, setScriptModalOpen] = useState(false);
    const [scriptLoading, setScriptLoading] = useState(false);
    const [scriptPackage, setScriptPackage] = useState(null);
    const [showTokenPlain, setShowTokenPlain] = useState(false);
    const [copiedKey, setCopiedKey] = useState('');
    const [rotatingToken, setRotatingToken] = useState(false);

    // Logs Filters & Detail Modal
    const [logNasFilter, setLogNasFilter] = useState('');
    const [logEstadoFilter, setLogEstadoFilter] = useState('todos');
    const [logsList, setLogsList] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [selectedLogDetail, setSelectedLogDetail] = useState(null);

    // Remote Files Explorer
    const [selectedFilesNasId, setSelectedFilesNasId] = useState('');
    const [remoteFilesData, setRemoteFilesData] = useState({ source: '', updatedAt: null, files: [] });
    const [loadingFiles, setLoadingFiles] = useState(false);

    const fetchOverview = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await api.get('/seguridad/nas/overview');
            const payload = res.data || {};
            setOverview({
                servers: payload.servers || [],
                sourceServer: payload.sourceServer || { ip: '5.252.55.29', totalDatabases: 0, totalSizeMb: 0 },
                databases: payload.databases || [],
                recentLogs: payload.recentLogs || [],
                schedulerStatus: payload.schedulerStatus || { activeCronJobs: 0, timezone: 'America/El_Salvador', runningJobs: [] }
            });
            setLogsList(payload.recentLogs || []);
            if (!selectedFilesNasId && payload.servers?.length > 0) {
                setSelectedFilesNasId(String(payload.servers[0].id));
                setRemoteFilesData({
                    source: 'cached',
                    updatedAt: payload.servers[0].ultimo_heartbeat_at || payload.servers[0].ultimo_backup_at,
                    files: payload.servers[0].archivos_remotos || []
                });
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar el Panel de Control NAS', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast, selectedFilesNasId]);

    useEffect(() => {
        fetchOverview(false);
    }, []);

    // Real-time Socket.io updates from Push jobs or Synology Pull reports
    useEffect(() => {
        const onNasUpdated = (evt) => {
            fetchOverview(true);
            if (evt?.mensaje && evt?.source === 'agente_pull') {
                addToast(evt.mensaje, evt.estado === 'error' ? 'error' : 'success');
            }
        };
        socket.on('nas_backup_updated', onNasUpdated);
        return () => {
            socket.off('nas_backup_updated', onNasUpdated);
        };
    }, [fetchOverview, addToast]);

    const fetchFilteredLogs = async (nasId = logNasFilter, estado = logEstadoFilter) => {
        setLoadingLogs(true);
        try {
            const params = new URLSearchParams();
            if (nasId) params.set('nas_id', nasId);
            if (estado && estado !== 'todos') params.set('estado', estado);
            params.set('limit', '80');
            const res = await api.get(`/seguridad/nas/logs?${params.toString()}`);
            setLogsList(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al consultar historial de backups', 'error');
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchRemoteFiles = async (nasIdOverride = null) => {
        const targetId = nasIdOverride || selectedFilesNasId;
        if (!targetId) return;
        setLoadingFiles(true);
        try {
            const res = await api.get(`/seguridad/nas/servers/${targetId}/files`);
            setRemoteFilesData({
                source: res.data?.source || 'live',
                updatedAt: res.data?.updatedAt || null,
                files: res.data?.files || []
            });
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudieron listar los archivos del NAS', 'error');
        } finally {
            setLoadingFiles(false);
        }
    };

    const openCreateModal = () => {
        setEditingServer(null);
        setFormData({
            ...EMPTY_FORM,
            es_principal: overview.servers.length === 0
        });
        setModalOpen(true);
    };

    const openEditModal = (srv) => {
        setEditingServer(srv);
        setFormData({
            nombre: srv.nombre || '',
            tipo_nas: srv.tipo_nas || 'synology',
            modo_conexion: srv.modo_conexion || 'synology_pull',
            host_lan: srv.host_lan || '',
            host_remoto: srv.host_remoto || '',
            puerto: srv.puerto ?? 5001,
            usar_ssl: srv.usar_ssl !== false,
            permitir_cert_autofirmado: srv.permitir_cert_autofirmado !== false,
            usuario: srv.usuario || '',
            password: '',
            ssh_private_key: '',
            ruta_destino: srv.ruta_destino || '/volume1/backups/sipe-db',
            servidor_origen_ip: srv.servidor_origen_ip || '5.252.55.29',
            respaldar_todas: srv.respaldar_todas !== false,
            bases_datos: Array.isArray(srv.bases_datos) ? srv.bases_datos : [],
            programacion_activa: Boolean(srv.programacion_activa),
            frecuencia: srv.frecuencia || 'daily',
            cron_expresion: srv.cron_expresion || '0 2 * * *',
            retencion_dias: Number(srv.retencion_dias || 30),
            notificar_telegram: srv.notificar_telegram !== false,
            es_principal: Boolean(srv.es_principal),
            activo: srv.activo !== false,
            notas: srv.notas || ''
        });
        setModalOpen(true);
    };

    const handleModeChange = (newMode) => {
        const modeMeta = MODE_OPTIONS.find((m) => m.value === newMode);
        let nextPort = modeMeta ? modeMeta.defaultPort : 5001;
        if (newMode === 'synology_dsm' && !formData.usar_ssl) nextPort = 5000;
        if (newMode === 'webdav' && !formData.usar_ssl) nextPort = 5005;
        setFormData((prev) => ({
            ...prev,
            modo_conexion: newMode,
            puerto: nextPort
        }));
    };

    const handleFrequencyChange = (freq) => {
        const found = FREQUENCY_OPTIONS.find((f) => f.value === freq);
        setFormData((prev) => ({
            ...prev,
            frecuencia: freq,
            programacion_activa: freq !== 'manual',
            cron_expresion: freq === 'custom' ? prev.cron_expresion : (found?.cron || '0 2 * * *')
        }));
    };

    const toggleDatabaseSelection = (dbName) => {
        setFormData((prev) => {
            const current = Array.isArray(prev.bases_datos) ? prev.bases_datos : [];
            const exists = current.includes(dbName);
            return {
                ...prev,
                bases_datos: exists ? current.filter((d) => d !== dbName) : [...current, dbName]
            };
        });
    };

    const handleSaveServer = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingServer) {
                const res = await api.put(`/seguridad/nas/servers/${editingServer.id}`, formData);
                addToast(res.data?.message || 'Servidor NAS actualizado', 'success');
            } else {
                const res = await api.post('/seguridad/nas/servers', formData);
                addToast(res.data?.message || 'Servidor NAS agregado', 'success');
            }
            setModalOpen(false);
            await fetchOverview(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar configuración del NAS', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteServer = async (srv) => {
        const ok = await confirm(
            `¿Eliminar el servidor NAS "${srv.nombre}" (${srv.host_lan || srv.host_remoto}) y su historial de respaldos?`,
            { title: 'Eliminar Servidor NAS', variant: 'danger' }
        );
        if (!ok) return;

        try {
            const res = await api.delete(`/seguridad/nas/servers/${srv.id}`);
            addToast(res.data?.message || 'Servidor NAS eliminado', 'success');
            await fetchOverview(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar servidor NAS', 'error');
        }
    };

    const handleTestConnection = async (srv) => {
        setTestingId(srv.id);
        try {
            const res = await api.post(`/seguridad/nas/servers/${srv.id}/test`);
            const data = res.data || {};
            addToast(data.message || 'Prueba finalizada', data.ok ? 'success' : 'warning');
            await fetchOverview(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al probar conexión con el NAS', 'error');
        } finally {
            setTestingId(null);
        }
    };

    const handleRunBackupNow = async (srv) => {
        const isPull = srv.modo_conexion === 'synology_pull';
        const promptText = isPull
            ? `El NAS "${srv.nombre}" opera en Modo Agente Pull. ¿Ejecutar ahora una verificación íntegra de volcado (.sql.gz + SHA-256) de las bases de 5.252.55.29 para validar que están listas para el Synology?`
            : `¿Ejecutar ahora el respaldo comprimido (.sql.gz) de las bases de datos de ${srv.servidor_origen_ip || '5.252.55.29'} hacia "${srv.nombre}"?`;

        const ok = await confirm(promptText, { title: isPull ? 'Verificar Volcados de 5.252.55.29' : 'Ejecutar Backup hacia NAS' });
        if (!ok) return;

        setRunningBackupId(srv.id);
        try {
            const res = await api.post(`/seguridad/nas/servers/${srv.id}/backup-now`, {}, { timeout: 300000 });
            const data = res.data || {};
            addToast(data.mensaje || 'Respaldo ejecutado correctamente', data.ok ? 'success' : 'warning');
            await fetchOverview(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al ejecutar respaldo NAS', 'error');
        } finally {
            setRunningBackupId(null);
        }
    };

    const openSynologyScriptModal = async (srv) => {
        setScriptModalOpen(true);
        setScriptLoading(true);
        setShowTokenPlain(false);
        setScriptPackage(null);
        try {
            const res = await api.get(`/seguridad/nas/servers/${srv.id}/synology-script`);
            setScriptPackage(res.data);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al generar script de Synology DSM', 'error');
            setScriptModalOpen(false);
        } finally {
            setScriptLoading(false);
        }
    };

    const handleRotateToken = async () => {
        if (!scriptPackage?.nasId) return;
        const ok = await confirm(
            'Al rotar el token, el script anterior instalado en el Synology NAS dejará de autenticarse hasta que pegue el nuevo script. ¿Desea continuar?',
            { title: 'Rotar Token de Agente NAS', variant: 'danger' }
        );
        if (!ok) return;

        setRotatingToken(true);
        try {
            await api.post(`/seguridad/nas/servers/${scriptPackage.nasId}/rotate-token`);
            const refreshed = await api.get(`/seguridad/nas/servers/${scriptPackage.nasId}/synology-script`);
            setScriptPackage(refreshed.data);
            setShowTokenPlain(true);
            addToast('Token rotado correctamente. Copie o descargue el script actualizado.', 'success');
            await fetchOverview(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al rotar token del NAS', 'error');
        } finally {
            setRotatingToken(false);
        }
    };

    const handleCopyText = async (text, key, successLabel) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            addToast(successLabel, 'success');
            setTimeout(() => setCopiedKey(''), 1800);
        } catch (_) {
            addToast('No se pudo copiar al portapapeles', 'error');
        }
    };

    const handleDownloadScriptFile = () => {
        if (!scriptPackage?.script) return;
        const blob = new Blob([scriptPackage.script], { type: 'text/x-shellscript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = scriptPackage.scriptFileName || 'sipe_nas_backup.sh';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        addToast(`Script ${scriptPackage.scriptFileName} descargado`, 'success');
    };

    const handleDownloadDatabaseDump = async (dbName) => {
        setDownloadingDb(dbName);
        try {
            const res = await api.get(`/seguridad/nas/download-db/${encodeURIComponent(dbName)}`, {
                responseType: 'blob',
                timeout: 300000
            });
            const disposition = res.headers?.['content-disposition'] || '';
            const match = disposition.match(/filename="?([^"]+)"?/i);
            const fileName = match ? match[1] : `${dbName}_backup.sql.gz`;
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/gzip' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            addToast(`Respaldo ${fileName} descargado correctamente`, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || `Error al descargar respaldo de ${dbName}`, 'error');
        } finally {
            setDownloadingDb(null);
        }
    };

    const handlePreviewAuditPdf = async () => {
        setPdfLoading(true);
        try {
            const res = await api.get('/seguridad/nas/reporte-pdf', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPdfPreview({ open: true, blob });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al generar reporte PDF de auditoría NAS', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    const primaryServer = useMemo(
        () => overview.servers.find((s) => s.es_principal) || overview.servers[0] || null,
        [overview.servers]
    );

    const onlineServersCount = useMemo(
        () => overview.servers.filter((s) => s.estado_conexion === 'online').length,
        [overview.servers]
    );

    const latestSuccessfulLog = useMemo(
        () => overview.recentLogs.find((l) => l.estado === 'completado' || l.estado === 'parcial') || null,
        [overview.recentLogs]
    );

    const primaryDiskTelemetry = primaryServer?.telemetria?.diskTotalBytes
        ? primaryServer.telemetria
        : null;

    const formEffectiveHost = (formData.host_remoto || '').trim() || (formData.host_lan || '').trim();
    const showPrivatePushWarning =
        ['synology_dsm', 'webdav', 'sftp'].includes(formData.modo_conexion) &&
        isPrivateIpClient(formEffectiveHost);

    const todayStr = new Date().toISOString().slice(0, 10);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header Compacto */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <HardDrive size={22} color="var(--primary)" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                                Panel de Control NAS &amp; Respaldos de Base de Datos
                            </h1>
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                color: 'var(--primary)'
                            }}>
                                ORIGEN {overview.sourceServer?.ip || '5.252.55.29'}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Gestión de servidores Synology NAS, respaldos MySQL comprimidos (.sql.gz + SHA-256), programación y auditoría
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handlePreviewAuditPdf}
                        disabled={pdfLoading}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileText size={15} /> {pdfLoading ? 'Generando...' : 'Reporte PDF'}
                    </button>
                    <button
                        type="button"
                        onClick={() => fetchOverview(false)}
                        disabled={loading}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar
                    </button>
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Plus size={16} /> Agregar NAS
                    </button>
                </div>
            </div>

            {/* KPI Cards Compactas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: `4px solid ${onlineServersCount > 0 ? '#10b981' : '#f59e0b'}` }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Servidores NAS Registrados
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.2rem' }}>
                        {onlineServersCount} / {overview.servers.length} en línea
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {primaryServer ? `Principal: ${primaryServer.host_lan || primaryServer.host_remoto} (${primaryServer.usuario})` : 'Sin NAS configurado'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Servidor Origen ({overview.sourceServer?.ip || '5.252.55.29'})
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.2rem', color: 'var(--primary)' }}>
                        {overview.databases.length} bases • {overview.sourceServer?.totalSizeMb || 0} MB
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        MySQL {overview.sourceServer?.mysqlVersion || '-'} • Volcado sin bloqueo
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: `4px solid ${latestSuccessfulLog ? '#10b981' : '#94a3b8'}` }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Último Respaldo Exitoso
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                        {latestSuccessfulLog ? formatDateTime(latestSuccessfulLog.finalizado_at || latestSuccessfulLog.iniciado_at) : 'Pendiente primer ciclo'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {latestSuccessfulLog
                            ? `${latestSuccessfulLog.bases_exitosas}/${latestSuccessfulLog.total_bases} bases • ${formatBytes(latestSuccessfulLog.tamano_total_bytes)}`
                            : 'Instale el script Synology o ejecute un respaldo'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Almacenamiento &amp; Retención NAS
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem', color: '#8b5cf6' }}>
                        {primaryDiskTelemetry
                            ? `${primaryDiskTelemetry.diskUsagePct}% usado (${formatBytes(primaryDiskTelemetry.diskFreeBytes)} libre)`
                            : `${primaryServer?.retencion_dias || 30} días de retención`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {primaryDiskTelemetry
                            ? `${primaryDiskTelemetry.dsmVersion || 'Synology DSM'} • Total ${formatBytes(primaryDiskTelemetry.diskTotalBytes)}`
                            : 'Telemetría de disco se actualiza al sincronizar'}
                    </div>
                </div>
            </div>

            {/* Banner informativo de topología 5.252.55.29 <-> Synology 192.168.31.222 */}
            {primaryServer && primaryServer.es_ip_privada && (
                <div
                    className="card glass"
                    style={{
                        padding: '0.75rem 1rem',
                        borderLeft: '4px solid var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        flexWrap: 'wrap'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flex: '1 1 320px' }}>
                        <ArrowRightLeft size={18} color="var(--primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ fontSize: '0.8rem', lineHeight: 1.45 }}>
                            <strong>Topología segura ({primaryServer.servidor_origen_ip || '5.252.55.29'} ↔ Synology {primaryServer.host_lan}):</strong>{' '}
                            Como <code style={{ fontSize: '0.78rem' }}>{primaryServer.host_lan}</code> es una IP de red local (LAN), el modo{' '}
                            <strong>Agente Pull Synology</strong> permite que su NAS descargue los respaldos cifrados por HTTPS con verificación SHA-256{' '}
                            <strong>sin abrir puertos en el router</strong>. Si conecta el NAS por <strong>Tailscale / WireGuard / DDNS</strong>, puede cambiar a Modo Push (DSM API, WebDAV o SFTP) en <em>Editar</em>.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => openSynologyScriptModal(primaryServer)}
                        className="btn-primary"
                        style={{ height: '34px', padding: '0 0.85rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
                    >
                        <Terminal size={14} /> Configurar Script en Synology
                    </button>
                </div>
            )}

            {/* Tabs Compactas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                {[
                    { id: 'servers', label: `Servidores NAS (${overview.servers.length})`, icon: Server },
                    { id: 'databases', label: `Bases de Datos 5.252.55.29 (${overview.databases.length})`, icon: Database },
                    { id: 'logs', label: `Historial de Backups (${logsList.length})`, icon: Clock },
                    { id: 'files', label: 'Archivos en NAS', icon: FolderOpen }
                ].map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.id);
                                if (tab.id === 'files' && selectedFilesNasId) {
                                    fetchRemoteFiles(selectedFilesNasId);
                                }
                            }}
                            className={active ? 'btn-primary' : 'btn-secondary'}
                            style={{
                                height: '36px',
                                padding: '0 0.9rem',
                                fontSize: '0.8rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            <Icon size={15} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: SERVIDORES NAS */}
            {activeTab === 'servers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {loading ? (
                        <div className="card glass" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                            Cargando servidores NAS...
                        </div>
                    ) : overview.servers.length === 0 ? (
                        <div className="card glass" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <HardDrive size={42} style={{ opacity: 0.25, marginBottom: '0.75rem' }} />
                            <p style={{ marginBottom: '1rem' }}>No hay servidores NAS registrados todavía.</p>
                            <button type="button" onClick={openCreateModal} className="btn-primary" style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}>
                                + Agregar Synology NAS (192.168.31.222)
                            </button>
                        </div>
                    ) : (
                        overview.servers.map((srv) => {
                            const badge = getStatusBadgeMeta(srv.estado_conexion);
                            const BadgeIcon = badge.icon;
                            const modeMeta = MODE_OPTIONS.find((m) => m.value === srv.modo_conexion);
                            const isTesting = testingId === srv.id;
                            const isBackingUp = runningBackupId === srv.id || srv.backup_en_curso;
                            const disk = srv.telemetria?.diskTotalBytes ? srv.telemetria : null;

                            return (
                                <div key={srv.id} className="card glass" style={{ padding: '1rem 1.2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', flex: '1 1 280px' }}>
                                            <div style={{
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                background: badge.bg,
                                                color: badge.color,
                                                flexShrink: 0
                                            }}>
                                                <HardDrive size={20} />
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{srv.nombre}</h2>
                                                    {srv.es_principal && (
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '4px',
                                                            fontWeight: 700,
                                                            background: 'rgba(59, 130, 246, 0.16)',
                                                            color: 'var(--primary)'
                                                        }}>
                                                            PRINCIPAL
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        background: badge.bg,
                                                        color: badge.color
                                                    }}>
                                                        <BadgeIcon size={12} /> {badge.label}
                                                    </span>
                                                    {!srv.activo && (
                                                        <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.45rem', borderRadius: '4px', background: 'rgba(148,163,184,0.2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                            PAUSADO
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                    <span><strong>IP LAN:</strong> {srv.host_lan || '-'}</span>
                                                    {srv.host_remoto && <span><strong>Host Remoto:</strong> {srv.host_remoto}</span>}
                                                    <span><strong>Usuario:</strong> {srv.usuario}</span>
                                                    <span><strong>Modo:</strong> {modeMeta?.shortLabel || srv.modo_conexion}</span>
                                                    <span><strong>Ruta:</strong> <code>{srv.ruta_destino}</code></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Botones de Acción Compactos */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleTestConnection(srv)}
                                                disabled={isTesting}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                            >
                                                <PlugZap size={14} /> {isTesting ? 'Probando...' : 'Probar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRunBackupNow(srv)}
                                                disabled={isBackingUp}
                                                className="btn-primary"
                                                style={{ height: '34px', padding: '0 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                            >
                                                <Play size={14} /> {isBackingUp ? 'Respaldando...' : (srv.modo_conexion === 'synology_pull' ? 'Verificar Dump' : 'Backup Ahora')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openSynologyScriptModal(srv)}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                title="Ver script de Synology DSM Task Scheduler y Token de Agente"
                                            >
                                                <Terminal size={14} /> Script DSM
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedFilesNasId(String(srv.id));
                                                    setActiveTab('files');
                                                    fetchRemoteFiles(String(srv.id));
                                                }}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 0.7rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                title="Explorar archivos de respaldo en este NAS"
                                            >
                                                <FolderOpen size={14} /> Archivos
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(srv)}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 0.65rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                                title="Editar configuración del NAS"
                                            >
                                                <Edit2 size={14} /> Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteServer(srv)}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 0.6rem', fontSize: '0.78rem', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}
                                                title="Eliminar NAS"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sub-detalles de programación, cobertura y disco */}
                                    <div style={{
                                        marginTop: '0.8rem',
                                        paddingTop: '0.75rem',
                                        borderTop: '1px solid var(--border)',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '1rem',
                                        fontSize: '0.78rem',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                            <span>
                                                <strong>Cobertura BD:</strong>{' '}
                                                {srv.respaldar_todas
                                                    ? `Todas las bases de ${srv.servidor_origen_ip} (${overview.databases.length})`
                                                    : `${srv.bases_datos?.length || 0} seleccionada(s)`}
                                            </span>
                                            <span>
                                                <strong>Programación:</strong>{' '}
                                                {srv.programacion_activa ? `${srv.frecuencia} (${srv.cron_expresion})` : 'Manual'}
                                            </span>
                                            <span><strong>Retención:</strong> {srv.retencion_dias} días</span>
                                            <span><strong>Último Backup:</strong> {formatDateTime(srv.ultimo_backup_at)}</span>
                                            {srv.ultimo_heartbeat_at && (
                                                <span><strong>Último Heartbeat:</strong> {formatDateTime(srv.ultimo_heartbeat_at)}</span>
                                            )}
                                        </div>

                                        {disk && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '210px' }}>
                                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                    Disco NAS: {disk.diskUsagePct}% ({formatBytes(disk.diskFreeBytes)} libres)
                                                </span>
                                                <div style={{ width: '90px', height: '7px', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${Math.min(100, Number(disk.diskUsagePct || 0))}%`,
                                                        height: '100%',
                                                        background: disk.diskUsagePct > 85 ? '#ef4444' : disk.diskUsagePct > 70 ? '#f59e0b' : '#10b981'
                                                    }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {srv.ultimo_error && (
                                        <div style={{
                                            marginTop: '0.65rem',
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '6px',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                            color: '#fca5a5',
                                            fontSize: '0.76rem',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.45rem'
                                        }}>
                                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                                            <span>{srv.ultimo_error}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* TAB 2: BASES DE DATOS EN 5.252.55.29 */}
            {activeTab === 'databases' && (
                <div className="card glass table-responsive" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                                Bases de Datos MySQL en {overview.sourceServer?.ip || '5.252.55.29'}
                            </h2>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                                Volcado seguro en caliente (<code>--single-transaction</code>) sin bloquear producción ni afectar estaciones.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Total: <strong>{overview.databases.length}</strong> bases · <strong>{overview.sourceServer?.totalSizeMb || 0} MB</strong>
                        </span>
                    </div>

                    <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(0,0,0,0.16)' }}>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Base de Datos</th>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Tablas</th>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Tamaño</th>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Cobertura NAS</th>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Último Respaldo</th>
                                <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overview.databases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        No se detectaron bases de datos de usuario en el servidor MySQL activo.
                                    </td>
                                </tr>
                            ) : (
                                overview.databases.map((dbItem) => {
                                    const coveredBy = overview.servers.filter(
                                        (s) => s.activo && (s.respaldar_todas || (s.bases_datos || []).includes(dbItem.name))
                                    );
                                    return (
                                        <tr key={dbItem.name} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                    <Database size={14} color="var(--primary)" />
                                                    <span>{dbItem.name}</span>
                                                    {dbItem.isPrimarySipe && (
                                                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(59,130,246,0.16)', color: 'var(--primary)' }}>
                                                            SIPE Admin
                                                        </span>
                                                    )}
                                                    {dbItem.isSaas && (
                                                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(139,92,246,0.16)', color: '#a78bfa' }}>
                                                            SaaS Estaciones
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', textAlign: 'right' }}>{dbItem.tablesCount}</td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>{dbItem.sizeMb} MB</td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem' }}>
                                                {coveredBy.length > 0 ? (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(16,185,129,0.14)', color: '#10b981', fontWeight: 600 }}>
                                                        Incluida ({coveredBy.length} NAS)
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245,158,11,0.14)', color: '#f59e0b', fontWeight: 600 }}>
                                                        Sin NAS asignado
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                {dbItem.lastBackupAt ? formatDateTime(dbItem.lastBackupAt) : 'Pendiente'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDownloadDatabaseDump(dbItem.name)}
                                                    disabled={downloadingDb === dbItem.name}
                                                    className="btn-secondary"
                                                    style={{ height: '30px', padding: '0 0.7rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                >
                                                    <Download size={13} /> {downloadingDb === dbItem.name ? 'Generando...' : 'Descargar .sql.gz'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 3: HISTORIAL Y AUDITORÍA */}
            {activeTab === 'logs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="card glass" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <select
                            value={logNasFilter}
                            onChange={(e) => {
                                setLogNasFilter(e.target.value);
                                fetchFilteredLogs(e.target.value, logEstadoFilter);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem', width: '240px', maxWidth: '100%' }}
                        >
                            <option value="">Todos los servidores NAS</option>
                            {overview.servers.map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre} ({s.host_lan || s.host_remoto})</option>
                            ))}
                        </select>

                        <select
                            value={logEstadoFilter}
                            onChange={(e) => {
                                setLogEstadoFilter(e.target.value);
                                fetchFilteredLogs(logNasFilter, e.target.value);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem', width: '165px', maxWidth: '100%' }}
                        >
                            <option value="todos">Todos los estados</option>
                            <option value="completado">Completado</option>
                            <option value="parcial">Parcial</option>
                            <option value="error">Error</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => fetchFilteredLogs()}
                            disabled={loadingLogs}
                            className="btn-primary"
                            style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <RefreshCw size={14} className={loadingLogs ? 'spin' : ''} /> Filtrar
                        </button>
                    </div>

                    <div className="card glass table-responsive" style={{ padding: '0.85rem 1rem' }}>
                        <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(0,0,0,0.16)' }}>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Fecha</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Servidor NAS</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Origen / Tipo</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Bases</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Tamaño</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Duración</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Estado</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logsList.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                            No hay ejecuciones registradas con el filtro actual.
                                        </td>
                                    </tr>
                                ) : (
                                    logsList.map((log) => {
                                        const st = getStatusBadgeMeta(log.estado);
                                        return (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{formatDateTime(log.iniciado_at)}</td>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {log.nas_nombre || `NAS #${log.nas_id}`}
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{log.nas_host_lan || ''}</div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem' }}>
                                                    <span>{log.tipo_ejecucion}</span>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{log.iniciado_por || '-'}</div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', textAlign: 'center', fontWeight: 600 }}>
                                                    {log.bases_exitosas}/{log.total_bases}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem', textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {formatBytes(log.tamano_total_bytes)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem', textAlign: 'right' }}>
                                                    {formatDuration(log.duracion_ms)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        background: st.bg,
                                                        color: st.color
                                                    }}>
                                                        {st.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLogDetail(log)}
                                                        className="btn-secondary"
                                                        style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.75rem' }}
                                                    >
                                                        Ver archivos
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 4: EXPLORADOR DE ARCHIVOS EN NAS */}
            {activeTab === 'files' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="card glass" style={{ padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <select
                            value={selectedFilesNasId}
                            onChange={(e) => {
                                setSelectedFilesNasId(e.target.value);
                                fetchRemoteFiles(e.target.value);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem', width: '280px', maxWidth: '100%' }}
                        >
                            {overview.servers.map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre} — {s.ruta_destino}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => fetchRemoteFiles()}
                            disabled={loadingFiles || !selectedFilesNasId}
                            className="btn-primary"
                            style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <RefreshCw size={14} className={loadingFiles ? 'spin' : ''} /> Consultar Archivos en NAS
                        </button>
                        {remoteFilesData.updatedAt && (
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Actualizado: {formatDateTime(remoteFilesData.updatedAt)}
                            </span>
                        )}
                    </div>

                    <div className="card glass table-responsive" style={{ padding: '0.85rem 1rem' }}>
                        <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(0,0,0,0.16)' }}>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Archivo (.sql.gz)</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Ruta en NAS</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Tamaño</th>
                                    <th style={{ padding: '0.45rem 0.55rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Última Modificación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingFiles ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Consultando inventario de archivos en el NAS...
                                        </td>
                                    </tr>
                                ) : remoteFilesData.files.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                            Aún no se han reportado archivos de respaldo en este NAS. Ejecute un respaldo o el script en su Synology DSM.
                                        </td>
                                    </tr>
                                ) : (
                                    remoteFilesData.files.map((file, idx) => (
                                        <tr key={`${file.name}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', fontWeight: 600 }}>{file.name}</td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{file.path || '-'}</td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatBytes(file.sizeBytes)}</td>
                                            <td style={{ padding: '0.45rem 0.55rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDateTime(file.modifiedAt)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL: AGREGAR / EDITAR SERVIDOR NAS */}
            <Modal
                isOpen={modalOpen}
                onClose={() => !saving && setModalOpen(false)}
                title={editingServer ? `Editar NAS: ${editingServer.nombre}` : 'Agregar Servidor NAS de Respaldos'}
                size="lg"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="btn-secondary" style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}>
                            Cancelar
                        </button>
                        <button type="submit" form="nas-server-form" disabled={saving} className="btn-primary" style={{ height: '36px', padding: '0 1.2rem', fontSize: '0.825rem' }}>
                            {saving ? 'Guardando...' : (editingServer ? 'Guardar Cambios' : 'Registrar NAS')}
                        </button>
                    </div>
                }
            >
                <form id="nas-server-form" onSubmit={handleSaveServer} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Nombre del NAS</label>
                            <input
                                type="text"
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                placeholder="Ej. Synology NAS Oficina"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Tipo / Marca de NAS</label>
                            <select
                                value={formData.tipo_nas}
                                onChange={(e) => setFormData({ ...formData, tipo_nas: e.target.value })}
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            >
                                {NAS_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="span-2">
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Modo de Conexión (5.252.55.29 ↔ NAS)</label>
                            <select
                                value={formData.modo_conexion}
                                onChange={(e) => handleModeChange(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            >
                                {MODE_OPTIONS.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        {showPrivatePushWarning && (
                            <div className="span-2" style={{
                                padding: '0.6rem 0.8rem',
                                borderRadius: '6px',
                                background: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontSize: '0.76rem',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.45rem'
                            }}>
                                <Info size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <span>
                                    Ha elegido un modo <strong>Push</strong> apuntando a una IP local privada (<code>{formEffectiveHost}</code>). Desde el VPS público <code>5.252.55.29</code> esto requiere un túnel <strong>Tailscale / WireGuard</strong> o un dominio <strong>DDNS</strong> en <em>Host Remoto</em>. Si no usa VPN ni puertos abiertos, elija <strong>Agente Pull Synology DSM</strong>.
                                </span>
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>IP LAN de referencia</label>
                            <input
                                type="text"
                                value={formData.host_lan}
                                onChange={(e) => setFormData({ ...formData, host_lan: e.target.value })}
                                placeholder="192.168.31.222"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Host Remoto / Tailscale / DDNS (opcional)</label>
                            <input
                                type="text"
                                value={formData.host_remoto}
                                onChange={(e) => setFormData({ ...formData, host_remoto: e.target.value })}
                                placeholder="Ej. 100.x.y.z o nas.sipesv.com"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Usuario NAS</label>
                            <input
                                type="text"
                                value={formData.usuario}
                                onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
                                placeholder="raulsosa"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                Contraseña NAS {formData.modo_conexion === 'synology_pull' ? '(Opcional en Modo Pull)' : '(Cifrada AES-256)'}
                            </label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={editingServer?.has_password ? '•••••••• (guardada, deje en blanco para conservar)' : '••••••••'}
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Carpeta Destino en NAS</label>
                            <input
                                type="text"
                                value={formData.ruta_destino}
                                onChange={(e) => setFormData({ ...formData, ruta_destino: e.target.value })}
                                placeholder="/volume1/backups/sipe-db"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Servidor Origen BD</label>
                            <input
                                type="text"
                                value={formData.servidor_origen_ip}
                                onChange={(e) => setFormData({ ...formData, servidor_origen_ip: e.target.value })}
                                placeholder="5.252.55.29"
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                        </div>

                        {/* Controles numéricos compactos (ancho controlado) */}
                        <div className="span-2" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.85rem', flexWrap: 'wrap' }}>
                            {formData.modo_conexion !== 'local_mount' && (
                                <div style={{ width: '115px' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Puerto</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="65535"
                                        value={formData.puerto}
                                        onChange={(e) => setFormData({ ...formData, puerto: parseInt(e.target.value, 10) || 5001 })}
                                        style={{ height: '36px', fontSize: '0.825rem' }}
                                    />
                                </div>
                            )}

                            <div style={{ width: '125px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Retención (días)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={formData.retencion_dias}
                                    onChange={(e) => setFormData({ ...formData, retencion_dias: parseInt(e.target.value, 10) || 30 })}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div style={{ flex: '1 1 190px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Frecuencia</label>
                                <select
                                    value={formData.frecuencia}
                                    onChange={(e) => handleFrequencyChange(e.target.value)}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                >
                                    {FREQUENCY_OPTIONS.map((f) => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </div>

                            {formData.frecuencia === 'custom' && (
                                <div style={{ width: '145px' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Expresión Cron</label>
                                    <input
                                        type="text"
                                        value={formData.cron_expresion}
                                        onChange={(e) => setFormData({ ...formData, cron_expresion: e.target.value })}
                                        placeholder="0 2 * * *"
                                        style={{ height: '36px', fontSize: '0.825rem', fontFamily: 'monospace' }}
                                    />
                                </div>
                            )}
                        </div>

                        {formData.modo_conexion === 'sftp' && (
                            <div className="span-2">
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                    Llave Privada SSH (Opcional · Recomendado para SFTP sin contraseña)
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.ssh_private_key}
                                    onChange={(e) => setFormData({ ...formData, ssh_private_key: e.target.value })}
                                    placeholder={editingServer?.has_ssh_key ? 'Llave SSH guardada cifrada (deje vacío para conservar)' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                                    style={{ height: 'auto', minHeight: '72px', fontSize: '0.76rem', fontFamily: 'monospace' }}
                                />
                            </div>
                        )}

                        {/* Checkboxes compactos 16x16px */}
                        <div className="span-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.25rem' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.respaldar_todas}
                                    onChange={(e) => setFormData({ ...formData, respaldar_todas: e.target.checked })}
                                />
                                Respaldar todas las bases de 5.252.55.29
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.es_principal}
                                    onChange={(e) => setFormData({ ...formData, es_principal: e.target.checked })}
                                />
                                NAS Principal
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.activo}
                                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                                />
                                Activo
                            </label>
                            {['synology_dsm', 'webdav'].includes(formData.modo_conexion) && (
                                <>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.usar_ssl}
                                            onChange={(e) => setFormData({ ...formData, usar_ssl: e.target.checked })}
                                        />
                                        Usar HTTPS / SSL
                                    </label>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.permitir_cert_autofirmado}
                                            onChange={(e) => setFormData({ ...formData, permitir_cert_autofirmado: e.target.checked })}
                                        />
                                        Permitir cert. autofirmado
                                    </label>
                                </>
                            )}
                        </div>

                        {/* Selección granular de bases cuando respaldar_todas = false */}
                        {!formData.respaldar_todas && (
                            <div className="span-2" style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.12)' }}>
                                <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    Seleccione las bases de datos a respaldar
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {overview.databases.map((dbItem) => (
                                        <label key={dbItem.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={(formData.bases_datos || []).includes(dbItem.name)}
                                                onChange={() => toggleDatabaseSelection(dbItem.name)}
                                            />
                                            <span>{dbItem.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({dbItem.sizeMb} MB)</span></span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="span-2">
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Notas / Ubicación Física</label>
                            <textarea
                                rows={2}
                                value={formData.notas}
                                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                                placeholder="Ej. Rack oficina central, volumen RAID-1, usuario raulsosa"
                                style={{ height: 'auto', minHeight: '56px', fontSize: '0.8rem' }}
                            />
                        </div>
                    </div>
                </form>
            </Modal>

            {/* MODAL: ASISTENTE SCRIPT SYNOLOGY DSM */}
            <Modal
                isOpen={scriptModalOpen}
                onClose={() => setScriptModalOpen(false)}
                title="Asistente de Conexión — Synology DSM Task Scheduler (Modo Pull Seguro)"
                size="lg"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
                        <button
                            type="button"
                            onClick={handleRotateToken}
                            disabled={rotatingToken || scriptLoading}
                            className="btn-secondary"
                            style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <KeyRound size={14} /> {rotatingToken ? 'Rotando...' : 'Rotar Token'}
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => scriptPackage?.script && handleCopyText(scriptPackage.script, 'script', 'Script Bash copiado al portapapeles')}
                                disabled={!scriptPackage?.script}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                {copiedKey === 'script' ? <Check size={14} /> : <Copy size={14} />} Copiar Script
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadScriptFile}
                                disabled={!scriptPackage?.script}
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <Download size={14} /> Descargar .sh
                            </button>
                        </div>
                    </div>
                }
            >
                {scriptLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                        Generando script personalizado para Synology DSM...
                    </div>
                ) : scriptPackage ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <div style={{ padding: '0.75rem 0.9rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, color: '#10b981', marginBottom: '0.35rem' }}>
                                <ShieldCheck size={16} /> Paso a paso en su Synology NAS ({scriptPackage.host_lan} · {scriptPackage.usuario})
                            </div>
                            <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem' }}>
                                {(scriptPackage.steps || []).map((step, i) => (
                                    <li key={i}>{step}</li>
                                ))}
                            </ol>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.14)' }}>
                            <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                <strong>Token X-NAS-Token:</strong>
                                <code style={{ fontSize: '0.76rem' }}>
                                    {showTokenPlain ? scriptPackage.token : (scriptPackage.tokenPrefix || '••••••••')}
                                </code>
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowTokenPlain((p) => !p)}
                                    className="btn-secondary"
                                    style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    {showTokenPlain ? <EyeOff size={13} /> : <Eye size={13} />} {showTokenPlain ? 'Ocultar' : 'Mostrar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCopyText(scriptPackage.token, 'token', 'Token X-NAS-Token copiado')}
                                    className="btn-secondary"
                                    style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    {copiedKey === 'token' ? <Check size={13} /> : <Copy size={13} />} Copiar
                                </button>
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                Script Listo para Synology ({scriptPackage.scriptFileName})
                            </div>
                            <pre style={{
                                margin: 0,
                                padding: '0.85rem',
                                borderRadius: '8px',
                                background: '#090d16',
                                color: '#e2e8f0',
                                fontSize: '0.74rem',
                                lineHeight: 1.45,
                                overflowX: 'auto',
                                maxHeight: '300px',
                                border: '1px solid var(--border)'
                            }}>
                                {scriptPackage.script}
                            </pre>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* MODAL: DETALLE DE EJECUCIÓN DE BACKUP */}
            <Modal
                isOpen={Boolean(selectedLogDetail)}
                onClose={() => setSelectedLogDetail(null)}
                title={selectedLogDetail ? `Detalle de Respaldo #${selectedLogDetail.id} — ${selectedLogDetail.nas_nombre || ''}` : 'Detalle'}
                size="lg"
            >
                {selectedLogDetail && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', padding: '0.7rem 0.85rem', borderRadius: '6px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
                            <span><strong>Inicio:</strong> {formatDateTime(selectedLogDetail.iniciado_at)}</span>
                            <span><strong>Fin:</strong> {formatDateTime(selectedLogDetail.finalizado_at)}</span>
                            <span><strong>Modo:</strong> {selectedLogDetail.modo_conexion}</span>
                            <span><strong>Total:</strong> {formatBytes(selectedLogDetail.tamano_total_bytes)}</span>
                            <span><strong>Duración:</strong> {formatDuration(selectedLogDetail.duracion_ms)}</span>
                            {Number(selectedLogDetail.archivos_purgados || 0) > 0 && (
                                <span><strong>Purgados por retención:</strong> {selectedLogDetail.archivos_purgados}</span>
                            )}
                        </div>

                        {selectedLogDetail.mensaje && (
                            <div style={{ fontSize: '0.82rem' }}>{selectedLogDetail.mensaje}</div>
                        )}
                        {selectedLogDetail.error_detalle && (
                            <div style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.78rem', color: '#fca5a5' }}>
                                {selectedLogDetail.error_detalle}
                            </div>
                        )}

                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(0,0,0,0.16)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Base de Datos</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Archivo</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Tamaño</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>SHA-256</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedLogDetail.archivos_generados || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                Sin detalle de archivos registrado.
                                            </td>
                                        </tr>
                                    ) : (
                                        selectedLogDetail.archivos_generados.map((f, idx) => {
                                            const fSt = getStatusBadgeMeta(f.status);
                                            return (
                                                <tr key={`${f.database}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>{f.database}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.76rem', fontFamily: 'monospace' }}>
                                                        {f.fileName}
                                                        {f.error && <div style={{ color: '#fca5a5', fontSize: '0.72rem' }}>{f.error}</div>}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatBytes(f.sizeBytes)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                        {f.sha256 ? `${f.sha256.slice(0, 14)}…` : '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.4rem', borderRadius: '4px', fontWeight: 700, background: fSt.bg, color: fSt.color }}>
                                                            {fSt.label}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Modal>

            {/* VISTA PREVIA DE REPORTE PDF CARTA (ReportPreviewModal) */}
            <ReportPreviewModal
                isOpen={pdfPreview.open}
                onClose={() => setPdfPreview({ open: false, blob: null })}
                title="Auditoría de Respaldos NAS & Bases de Datos"
                subtitle={`Servidor Origen ${overview.sourceServer?.ip || '5.252.55.29'} • ${overview.servers.length} servidor(es) NAS`}
                badge="SEGURIDAD · NAS"
                pdfSource={pdfPreview.blob}
                fileName={`Auditoria_NAS_Backups_${todayStr}.pdf`}
                totalPages={1}
                footerInfo="Reporte Oficial de Auditoría de Respaldos NAS - Formato Carta"
            />
        </div>
    );
}
