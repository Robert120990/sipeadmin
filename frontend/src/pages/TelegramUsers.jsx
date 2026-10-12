import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Bot, RefreshCw, Plus, Edit2, Trash2, CheckCircle2,
    XCircle, Clock, Shield, Search, Send, Copy, AlertTriangle,
    Activity, Power, HelpCircle, Check, Eye, EyeOff,
    UserCheck, ShieldAlert, ShieldCheck, Link2,
    ThumbsUp, ThumbsDown, MessageSquare, Database, Cpu, Radio,
    Terminal, AlertOctagon
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';

export default function TelegramUsers() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    // Estado principal
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [summary, setSummary] = useState({ total: 0, activos: 0, vinculados: 0, pendientes: 0, inactivos: 0 });
    const [botStatus, setBotStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'bitacora' | 'feedback'

    // Catálogo de usuarios de SIPE Admin para vinculación
    const [systemUsers, setSystemUsers] = useState([]);
    const [loadingSystemUsers, setLoadingSystemUsers] = useState(false);

    // Bitácora
    const [bitacora, setBitacora] = useState([]);
    const [loadingBitacora, setLoadingBitacora] = useState(false);

    // Retroalimentación & Mejora Continua
    const [feedbacks, setFeedbacks] = useState([]);
    const [feedbackStats, setFeedbackStats] = useState({ total: 0, utiles: 0, no_utiles: 0, pendientes: 0, con_comentarios: 0, tasa_satisfaccion: 100 });
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackFilter, setFeedbackFilter] = useState('ALL');

    // Diagnóstico de Salud & Auditoría Forense
    const [healthData, setHealthData] = useState(null);
    const [loadingHealth, setLoadingHealth] = useState(false);
    const [forensicErrors, setForensicErrors] = useState([]);
    const [loadingErrors, setLoadingErrors] = useState(false);
    const [clearingErrors, setClearingErrors] = useState(false);
    const [selectedError, setSelectedError] = useState(null);
    const [errorDetailModalOpen, setErrorDetailModalOpen] = useState(false);
    const [errorFilter, setErrorFilter] = useState('ALL');

    // Modal de usuario
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [saving, setSaving] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    // Formulario
    const initialFormState = {
        telegram_user_id: '',
        telegram_username: '',
        first_name: '',
        last_name: '',
        user_id: '',
        heredar_permisos: true,
        activo: 1,
        permiso_ventas: 1,
        permiso_saldos_banco: 1,
        permiso_saldos_chequera: 1,
        permiso_alertas: 1,
        notas: ''
    };
    const [formData, setFormData] = useState(initialFormState);

    // Usuario de SIPE seleccionado actualmente en el formulario
    const selectedSystemUser = useMemo(() => {
        if (!formData.user_id) return null;
        return systemUsers.find(su => String(su.id) === String(formData.user_id)) || null;
    }, [formData.user_id, systemUsers]);

    // Modal de mensaje de prueba
    const [testModalOpen, setTestModalOpen] = useState(false);
    const [testTargetUser, setTestTargetUser] = useState(null);
    const [testMessageText, setTestMessageText] = useState('');
    const [sendingTest, setSendingTest] = useState(false);

    // Cargar estado del bot
    const fetchBotStatus = useCallback(async () => {
        try {
            const res = await api.get('/telegram/status');
            setBotStatus(res.data);
        } catch (e) {
            console.warn('Error cargando estado de Telegram:', e.message);
        }
    }, []);

    // Cargar catálogo de usuarios de SIPE Admin
    const fetchSystemUsers = useCallback(async () => {
        setLoadingSystemUsers(true);
        try {
            const res = await api.get('/telegram/system-users');
            if (Array.isArray(res.data) && res.data.length > 0) {
                setSystemUsers(res.data);
                return;
            }
        } catch (e) {
            console.warn('Error cargando /telegram/system-users:', e.message);
        }

        // Fallback defensivo a /users si /telegram/system-users no está disponible aún
        try {
            const fallbackRes = await api.get('/users');
            const list = Array.isArray(fallbackRes.data) ? fallbackRes.data : (fallbackRes.data?.users || []);
            if (list.length > 0) {
                const mapped = list.map(u => ({
                    id: u.id,
                    username: u.username,
                    nombre: u.nombre || u.username,
                    email: u.email || '',
                    role_id: u.role_id,
                    role_name: u.role_name || 'Sin Rol',
                    status: u.status || 'active',
                    permissions: {
                        ventas: u.role_name === 'Administrator',
                        saldos_banco: u.role_name === 'Administrator',
                        saldos_chequera: u.role_name === 'Administrator',
                        alertas: u.role_name === 'Administrator'
                    }
                }));
                setSystemUsers(mapped);
                return;
            }
        } catch (fallbackErr) {
            console.warn('Fallback a /users falló:', fallbackErr.message);
        } finally {
            setLoadingSystemUsers(false);
        }
    }, []);

    // Cargar usuarios de Telegram
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/telegram/users');
            setUsers(res.data.users || []);
            setSummary(res.data.summary || { total: 0, activos: 0, vinculados: 0, pendientes: 0, inactivos: 0 });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar usuarios de Telegram', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    // Cargar bitácora
    const fetchBitacora = useCallback(async () => {
        setLoadingBitacora(true);
        try {
            const res = await api.get('/telegram/bitacora');
            setBitacora(res.data || []);
        } catch (err) {
            addToast('Error al cargar bitácora de Telegram', 'error');
        } finally {
            setLoadingBitacora(false);
        }
    }, [addToast]);

    // Cargar retroalimentación & sugerencias de mejora
    const fetchFeedback = useCallback(async () => {
        setLoadingFeedback(true);
        try {
            const [statsRes, listRes] = await Promise.all([
                api.get('/telegram/feedback/stats'),
                api.get('/telegram/feedback', { params: { limit: 100 } })
            ]);
            if (statsRes.data?.ok) {
                setFeedbackStats(statsRes.data.stats || {});
            }
            if (listRes.data?.ok) {
                setFeedbacks(listRes.data.feedbacks || []);
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar retroalimentación de Telegram', 'error');
        } finally {
            setLoadingFeedback(false);
        }
    }, [addToast]);

    // Cargar diagnóstico de salud operacional
    const fetchHealthDiagnostics = useCallback(async () => {
        setLoadingHealth(true);
        try {
            const res = await api.get('/telegram/audit/health');
            setHealthData(res.data.diagnostics || res.data);
        } catch (err) {
            console.warn('Error al cargar diagnóstico de salud:', err.message);
        } finally {
            setLoadingHealth(false);
        }
    }, []);

    // Cargar errores forenses almacenados en el buffer circular
    const fetchForensicErrors = useCallback(async () => {
        setLoadingErrors(true);
        try {
            const res = await api.get('/telegram/audit/errors');
            setForensicErrors(res.data.errors || []);
        } catch (err) {
            console.warn('Error al cargar errores forenses:', err.message);
        } finally {
            setLoadingErrors(false);
        }
    }, []);

    // Limpiar el buffer circular de errores forenses
    const handleClearForensicErrors = async () => {
        const ok = await confirm('¿Estás seguro de vaciar el buffer forense de errores en memoria?', {
            variant: 'danger',
            title: 'Limpiar Buffer Forense',
            confirmText: 'Sí, Vaciar Buffer'
        });
        if (!ok) return;

        setClearingErrors(true);
        try {
            await api.post('/telegram/audit/clear-errors');
            addToast('Buffer de errores forenses limpiado exitosamente', 'success');
            await fetchForensicErrors();
            await fetchHealthDiagnostics();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al limpiar buffer forense', 'error');
        } finally {
            setClearingErrors(false);
        }
    };

    useEffect(() => {
        fetchBotStatus();
        fetchUsers();
        fetchSystemUsers();
        fetchHealthDiagnostics();
    }, [fetchBotStatus, fetchUsers, fetchSystemUsers, fetchHealthDiagnostics]);

    useEffect(() => {
        if (activeTab === 'bitacora') {
            fetchBitacora();
        } else if (activeTab === 'feedback') {
            fetchFeedback();
            fetchHealthDiagnostics();
        } else if (activeTab === 'diagnostico') {
            fetchHealthDiagnostics();
            fetchForensicErrors();
        }
    }, [activeTab, fetchBitacora, fetchFeedback, fetchHealthDiagnostics, fetchForensicErrors]);

    // Marcar retroalimentación como revisada
    const handleMarkFeedbackReviewed = async (fb) => {
        const ok = await confirm(
            `¿Marcar como revisada la sugerencia de @${fb.telegram_username || fb.first_name || fb.telegram_user_id}?`,
            { title: 'Revisión de Mejora Continua', confirmText: 'Marcar como Revisado' }
        );
        if (!ok) return;

        try {
            await api.patch(`/telegram/feedback/${fb.id}/revisar`, {
                notas_resolucion: 'Revisado y registrado para optimización de consultas'
            });
            addToast('Retroalimentación marcada como revisada', 'success');
            fetchFeedback();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al marcar retroalimentación', 'error');
        }
    };

    // Probar conexión
    const handleTestConnection = async () => {
        setStatusLoading(true);
        try {
            const res = await api.post('/telegram/test-connection');
            if (res.data?.ok) {
                addToast(`Conexión exitosa con @${res.data.result?.username} (${res.data.result?.first_name})`, 'success');
                fetchBotStatus();
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conectar con Telegram API', 'error');
        } finally {
            setStatusLoading(false);
        }
    };

    // Reiniciar bot
    const handleRestartBot = async () => {
        setStatusLoading(true);
        try {
            const res = await api.post('/telegram/restart-bot');
            addToast(res.data?.message || 'Bot reiniciado con éxito', 'success');
            fetchBotStatus();
        } catch (err) {
            addToast('Error al reiniciar el bot', 'error');
        } finally {
            setStatusLoading(false);
        }
    };

    // Alternar activación de sondeo
    const handleToggleBotActive = async () => {
        const action = botStatus?.isActive ? 'pausar' : 'activar';
        if (!await confirm(`¿Estás seguro de ${action} el bot de Telegram?`, { variant: botStatus?.isActive ? 'danger' : 'info' })) return;

        try {
            const res = await api.post('/telegram/toggle-active');
            addToast(`Bot ${res.data?.is_active ? 'activado' : 'pausado'} correctamente`, 'success');
            fetchBotStatus();
        } catch (err) {
            addToast('Error al alternar estado del bot', 'error');
        }
    };

    // Abrir modal para crear
    const handleOpenCreate = () => {
        setEditingUser(null);
        setFormData(initialFormState);
        setModalOpen(true);
    };

    // Selección de usuario del sistema SIPE para vinculación
    const handleSystemUserSelect = (selectedId) => {
        if (!selectedId) {
            setFormData(prev => ({
                ...prev,
                user_id: '',
                heredar_permisos: false
            }));
            return;
        }
        const matched = systemUsers.find(su => String(su.id) === String(selectedId));
        if (matched) {
            setFormData(prev => ({
                ...prev,
                user_id: String(matched.id),
                heredar_permisos: true,
                first_name: prev.first_name || (matched.nombre || '').split(' ')[0] || '',
                last_name: prev.last_name || (matched.nombre || '').split(' ').slice(1).join(' ') || '',
                permiso_ventas: matched.permissions?.ventas ? 1 : 0,
                permiso_saldos_banco: matched.permissions?.saldos_banco ? 1 : 0,
                permiso_saldos_chequera: matched.permissions?.saldos_chequera ? 1 : 0,
                permiso_alertas: matched.permissions?.alertas ? 1 : 0
            }));
        }
    };

    // Abrir modal para editar o aprobar
    const handleOpenEdit = (user) => {
        setEditingUser(user);
        let targetUserId = user.user_id ? String(user.user_id) : '';

        // Autocoincidencia inteligente si aún no está vinculado a SIPE
        if (!targetUserId && systemUsers.length > 0) {
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
            const cleanTele = (user.telegram_username || '').replace(/^@/, '').trim().toLowerCase();
            const matched = systemUsers.find(su => 
                (su.nombre && su.nombre.trim().toLowerCase() === fullName && fullName !== '') ||
                (su.username && su.username.trim().toLowerCase() === cleanTele && cleanTele !== '') ||
                (su.email && cleanTele !== '' && su.email.toLowerCase().includes(cleanTele))
            );
            if (matched) {
                targetUserId = String(matched.id);
            }
        }

        const linkedSystemUser = systemUsers.find(su => String(su.id) === String(targetUserId));
        const isLinked = Boolean(targetUserId && linkedSystemUser);

        setFormData({
            telegram_user_id: user.telegram_user_id || '',
            telegram_username: user.telegram_username ? user.telegram_username.replace(/^@/, '') : '',
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            user_id: targetUserId,
            heredar_permisos: isLinked,
            activo: user.activo ? 1 : 0,
            permiso_ventas: user.effective_permissions ? (user.effective_permissions.ventas ? 1 : 0) : (user.permiso_ventas ? 1 : 0),
            permiso_saldos_banco: user.effective_permissions ? (user.effective_permissions.saldos_banco ? 1 : 0) : (user.permiso_saldos_banco ? 1 : 0),
            permiso_saldos_chequera: user.effective_permissions ? (user.effective_permissions.saldos_chequera ? 1 : 0) : (user.permiso_saldos_chequera ? 1 : 0),
            permiso_alertas: user.effective_permissions ? (user.effective_permissions.alertas ? 1 : 0) : (user.permiso_alertas ? 1 : 0),
            notas: user.notas || ''
        });
        setModalOpen(true);
    };

    // Guardar usuario
    const handleSubmitUser = async (e) => {
        e.preventDefault();
        if (!formData.telegram_user_id) {
            addToast('El ID de Telegram es obligatorio', 'error');
            return;
        }

        setSaving(true);
        try {
            if (editingUser) {
                await api.put(`/telegram/users/${editingUser.id}`, formData);
                addToast('Usuario de Telegram actualizado con éxito', 'success');
            } else {
                await api.post('/telegram/users', formData);
                addToast('Usuario de Telegram registrado con éxito', 'success');
            }
            setModalOpen(false);
            fetchUsers();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar usuario', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Toggle rápido de estado activo
    const handleToggleUserActive = async (user) => {
        const newStatus = user.activo ? 0 : 1;
        try {
            await api.put(`/telegram/users/${user.id}`, { activo: newStatus });
            addToast(`Usuario ${newStatus ? 'activado' : 'desactivado'} con éxito`, 'success');
            fetchUsers();
        } catch (err) {
            addToast('Error al actualizar estado del usuario', 'error');
        }
    };

    // Eliminar usuario
    const handleDeleteUser = async (user) => {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_user_id;
        if (!await confirm(`¿Estás seguro de revocar el acceso y eliminar al usuario "${name}"?`, { variant: 'danger' })) return;

        try {
            await api.delete(`/telegram/users/${user.id}`);
            addToast('Usuario eliminado correctamente', 'success');
            fetchUsers();
        } catch (err) {
            addToast('Error al eliminar usuario', 'error');
        }
    };

    // Copiar ID al portapapeles
    const handleCopyId = (id) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        addToast('ID de Telegram copiado al portapapeles', 'success');
    };

    // Enviar mensaje de prueba
    const handleOpenTestModal = (user) => {
        setTestTargetUser(user);
        setTestMessageText('¡Hola! Esta es una prueba de conexión desde el panel de SIPE Admin.');
        setTestModalOpen(true);
    };

    const handleSendTestMessage = async (e) => {
        e.preventDefault();
        if (!testTargetUser || !testMessageText) return;

        setSendingTest(true);
        try {
            await api.post('/telegram/send-test-message', {
                telegram_user_id: testTargetUser.telegram_user_id,
                message: testMessageText
            });
            addToast('Mensaje de prueba enviado exitosamente por Telegram', 'success');
            setTestModalOpen(false);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al enviar mensaje de prueba', 'error');
        } finally {
            setSendingTest(false);
        }
    };

    // Filtrar usuarios
    const filteredUsers = users.filter(u => {
        const term = searchTerm.toLowerCase();
        const full = `${u.first_name || ''} ${u.last_name || ''} ${u.telegram_username || ''} ${u.telegram_user_id || ''}`.toLowerCase();
        return full.includes(term);
    });

    const pendingUsers = users.filter(u => !u.activo && (u.notas || '').includes('Solicitud'));

    // Renderizado de Tarjeta de Salud del Bot (Estado Polling, Conexión BD, Gemini AI, Sesiones Activas)
    const renderBotHealthCard = () => {
        const isHealthy = healthData?.status === 'healthy';
        const isDegraded = healthData?.status === 'degraded';
        const isCritical = healthData?.status === 'critical';

        const statusLabel = isHealthy
            ? '🟢 Sistema Saludable y Operativo'
            : isDegraded
                ? '🟡 Rendimiento Degradado'
                : isCritical
                    ? '🔴 Alerta Crítica Operativa'
                    : '⏳ Verificando Salud...';

        const statusBg = isHealthy
            ? 'rgba(16, 185, 129, 0.12)'
            : isDegraded
                ? 'rgba(245, 158, 11, 0.12)'
                : isCritical
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(107, 114, 128, 0.12)';

        const statusColor = isHealthy
            ? '#10B981'
            : isDegraded
                ? '#F59E0B'
                : isCritical
                    ? '#EF4444'
                    : 'var(--text-muted)';

        const lastPollStr = healthData?.bot?.lastPollAt
            ? new Date(healthData.bot.lastPollAt).toLocaleTimeString('es-SV', { hour12: false })
            : 'Sin registro';

        return (
            <div className="card glass" style={{ padding: '0.9rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <Activity size={18} color="var(--primary)" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Tarjeta de Salud del Bot & Diagnóstico Forense
                        </span>
                        <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            background: statusBg,
                            color: statusColor
                        }}>
                            {statusLabel}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            Última verificación: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString('es-SV', { hour12: false }) : 'N/A'}
                        </span>
                        <button
                            className="btn-secondary"
                            onClick={fetchHealthDiagnostics}
                            disabled={loadingHealth}
                            style={{ height: '28px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.55rem' }}
                        >
                            <RefreshCw size={12} className={loadingHealth ? 'spin' : ''} /> Actualizar Salud
                        </button>
                    </div>
                </div>

                {/* 4 Pilares Fundamentales: Polling, Bases de Datos, Gemini AI, Sesiones Activas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                    {/* Pilar 1: Estado Polling */}
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        background: 'var(--surface-color, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Radio size={13} color="#3B82F6" /> Estado Polling
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: healthData?.bot?.isPolling ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: healthData?.bot?.isPolling ? '#10B981' : '#EF4444'
                            }}>
                                {healthData?.bot?.isPolling ? 'Sondeo Activo' : 'En Pausa'}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {healthData?.bot?.username || '@SIPE_IA_BOT'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Último sondeo: <strong>{lastPollStr}</strong>
                        </div>
                    </div>

                    {/* Pilar 2: Conexión Bases de Datos */}
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        background: 'var(--surface-color, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Database size={13} color="#10B981" /> Conexión Bases de Datos
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: healthData?.databases?.sipeAdmin?.connected && healthData?.databases?.sistemaSaas?.connected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: healthData?.databases?.sipeAdmin?.connected && healthData?.databases?.sistemaSaas?.connected ? '#10B981' : '#EF4444'
                            }}>
                                {healthData?.databases?.sipeAdmin?.connected && healthData?.databases?.sistemaSaas?.connected ? '2/2 Conectadas' : 'Degradado'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                            <span>db_sipe_admin:</span>
                            <strong style={{ color: healthData?.databases?.sipeAdmin?.connected ? '#10B981' : '#EF4444' }}>
                                {healthData?.databases?.sipeAdmin?.connected ? `🟢 Conectada (${healthData.databases.sipeAdmin.latencyMs} ms)` : '🔴 Desconectada'}
                            </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                            <span>db_sistema_saas:</span>
                            <strong style={{ color: healthData?.databases?.sistemaSaas?.connected ? '#10B981' : '#EF4444' }}>
                                {healthData?.databases?.sistemaSaas?.connected ? `🟢 Conectada (${healthData.databases.sistemaSaas.latencyMs} ms)` : '🔴 Desconectada'}
                            </strong>
                        </div>
                    </div>

                    {/* Pilar 3: Gemini AI & Copiloto */}
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        background: 'var(--surface-color, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Cpu size={13} color="#8B5CF6" /> Gemini AI
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: healthData?.gemini?.configured ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                color: healthData?.gemini?.configured ? '#10B981' : '#F59E0B'
                            }}>
                                {healthData?.gemini?.configured ? '🟢 Configurado' : '⚠️ Sin Clave'}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {healthData?.gemini?.model || 'gemini-2.0-flash'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Consultas multi-turno: <strong>{healthData?.metrics?.multiTurnQueriesCount || 0}</strong>
                        </div>
                    </div>

                    {/* Pilar 4: Sesiones Activas & Memoria */}
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        background: 'var(--surface-color, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <UserCheck size={13} color="#F59E0B" /> Sesiones Activas
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: 'rgba(59, 130, 246, 0.12)',
                                color: '#3B82F6'
                            }}>
                                Últimos 20 min
                            </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {healthData?.activeConversations?.count || 0} usuarios activos
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Notas de voz: <strong>{healthData?.metrics?.voiceNotesProcessed || 0}</strong> proc. / <strong>{healthData?.metrics?.voiceNotesFailed || 0}</strong> fallidas
                        </div>
                    </div>
                </div>

                {/* Barra de Métricas Forenses Consolidadas */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--surface-color, rgba(255,255,255,0.02))',
                    border: '1px dashed var(--border)',
                    borderRadius: '6px',
                    fontSize: '0.76rem',
                    alignItems: 'center'
                }}>
                    <span style={{ color: 'var(--text-muted)' }}>Métricas Forenses:</span>
                    <span>Consultas Totales: <strong>{healthData?.metrics?.totalQueriesReceived || 0}</strong></span>
                    <span style={{ color: '#10B981' }}>Exitosas: <strong>{healthData?.metrics?.totalSuccessfulQueries || 0}</strong></span>
                    <span style={{ color: (healthData?.metrics?.totalFailedQueries || 0) > 0 ? '#EF4444' : 'var(--text-main)' }}>
                        Fallidas: <strong>{healthData?.metrics?.totalFailedQueries || 0}</strong>
                    </span>
                    <span>
                        Tasa Global de Error: <strong style={{
                            color: (healthData?.metrics?.errorRatePct || 0) > 15 ? '#EF4444' : (healthData?.metrics?.errorRatePct || 0) > 5 ? '#F59E0B' : '#10B981'
                        }}>{healthData?.metrics?.errorRatePct ?? 0}%</strong>
                    </span>
                    <span>Latencia Promedio: ⏱️ <strong>{healthData?.metrics?.averageResponseTimeMs || 0} ms</strong></span>
                    <span>Callbacks Alerta: 🚨 <strong>{healthData?.metrics?.alertCallbacksHandled || 0}</strong></span>
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header Compacto */}
            <div className="page-header" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0088cc, #005580)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(0, 136, 204, 0.3)'
                    }}>
                        <Bot size={22} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Usuarios y Bot de Telegram
                        </h1>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Administración de accesos autorizados para consultas gerenciales (@SIPE_IA_BOT)
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="btn-secondary"
                        onClick={handleTestConnection}
                        disabled={statusLoading}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0 0.85rem' }}
                        title="Verificar conexión con Telegram API"
                    >
                        <Activity size={15} /> Probar Conexión
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={handleRestartBot}
                        disabled={statusLoading}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0 0.85rem' }}
                        title="Reiniciar polling de Telegram"
                    >
                        <RefreshCw size={15} className={statusLoading ? 'spin' : ''} /> Reiniciar
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleOpenCreate}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0 1rem' }}
                    >
                        <Plus size={16} /> Nuevo Usuario
                    </button>
                </div>
            </div>

            {/* Tarjeta de Estado del Bot */}
            <div className="card glass" style={{ padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: '4px solid #0088cc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                            display: 'inline-block',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: botStatus?.isConnected && botStatus?.isPolling ? '#10B981' : '#EF4444',
                            boxShadow: botStatus?.isConnected && botStatus?.isPolling ? '0 0 8px #10B981' : 'none'
                        }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {botStatus?.isConnected && botStatus?.isPolling ? 'En Línea (Sondeo Activo)' : 'Desconectado o en Pausa'}
                        </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Bot Oficial: <strong style={{ color: 'var(--primary)' }}>@{botStatus?.bot?.username || 'SIPE_IA_BOT'}</strong> ({botStatus?.bot?.first_name || 'SIPE_BOT'})
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        HTTP API ID: <code>{botStatus?.bot?.id || '8852249993'}</code>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={handleToggleBotActive}
                        className={botStatus?.isActive ? 'btn-secondary' : 'btn-primary'}
                        style={{ height: '32px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0 0.75rem' }}
                    >
                        <Power size={14} color={botStatus?.isActive ? '#EF4444' : '#10B981'} />
                        {botStatus?.isActive ? 'Pausar Sondeo' : 'Reanudar Sondeo'}
                    </button>
                </div>
            </div>

            {/* Banner de Solicitudes Pendientes (Aprobación rápida en 1 clic) */}
            {pendingUsers.length > 0 && (
                <div className="card glass" style={{
                    padding: '0.85rem 1.25rem',
                    borderLeft: '4px solid #F59E0B',
                    background: 'rgba(245, 158, 11, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} color="#F59E0B" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#B45309' }}>
                            Solicitudes de Acceso Pendientes ({pendingUsers.length})
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            — Usuarios que escribieron al bot y requieren autorización:
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                        {pendingUsers.map(u => (
                            <div
                                key={u.id}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    padding: '0.4rem 0.75rem',
                                    background: 'var(--surface-color, #ffffff)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem'
                                }}
                            >
                                <span>
                                    <strong>{u.first_name || 'Usuario'} {u.last_name || ''}</strong>
                                    {u.telegram_username ? ` (${u.telegram_username})` : ''}
                                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>ID: {u.telegram_user_id}</span>
                                </span>
                                <button
                                    className="btn-primary"
                                    onClick={() => handleOpenEdit(u)}
                                    style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.5rem' }}
                                >
                                    Aprobar y Asignar Permisos
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pestañas de Vista */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        fontSize: '0.825rem',
                        fontWeight: activeTab === 'users' ? 700 : 500,
                        color: activeTab === 'users' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: activeTab === 'users' ? '2px solid var(--primary)' : '2px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    Usuarios Autorizados ({summary.total})
                </button>
                <button
                    onClick={() => setActiveTab('bitacora')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        fontSize: '0.825rem',
                        fontWeight: activeTab === 'bitacora' ? 700 : 500,
                        color: activeTab === 'bitacora' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: activeTab === 'bitacora' ? '2px solid var(--primary)' : '2px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    Bitácora de Consultas Telegram
                </button>
                <button
                    onClick={() => setActiveTab('feedback')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        fontSize: '0.825rem',
                        fontWeight: activeTab === 'feedback' ? 700 : 500,
                        color: activeTab === 'feedback' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: activeTab === 'feedback' ? '2px solid var(--primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}
                >
                    <MessageSquare size={13} />
                    Mejora Continua & Feedback
                    {feedbackStats.no_utiles > 0 && (
                        <span style={{
                            background: '#EF4444',
                            color: '#fff',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '10px'
                        }}>
                            {feedbackStats.no_utiles}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('diagnostico')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        fontSize: '0.825rem',
                        fontWeight: activeTab === 'diagnostico' ? 700 : 500,
                        color: activeTab === 'diagnostico' ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: activeTab === 'diagnostico' ? '2px solid var(--primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}
                >
                    <Activity size={13} />
                    Diagnóstico & Salud Forense
                    {forensicErrors.length > 0 && (
                        <span style={{
                            background: '#EF4444',
                            color: '#fff',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '10px'
                        }}>
                            {forensicErrors.length}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'users' && (
                <>
                    {/* Barra de Filtros y Búsqueda */}
                    <div className="card glass" style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, usuario o Telegram ID..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '36px',
                                    paddingLeft: '34px',
                                    fontSize: '0.825rem',
                                    borderRadius: 'var(--border-radius)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-color)',
                                    color: 'var(--text-main)',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', fontWeight: 600 }}>
                                {summary.activos} Activos
                            </span>
                            <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <UserCheck size={13} />
                                {summary.vinculados || 0} Vinculados a SIPE
                            </span>
                            <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', fontWeight: 600 }}>
                                {summary.pendientes} Pendientes
                            </span>
                            <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', fontWeight: 600 }}>
                                {summary.inactivos} Inactivos
                            </span>
                        </div>
                    </div>

                    {/* Tabla de Usuarios */}
                    <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Telegram ID
                                    </th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Nombre / Usuario
                                    </th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Estado
                                    </th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Permisos de Consulta
                                    </th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Última Interacción
                                    </th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            Cargando usuarios de Telegram...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {searchTerm ? 'No se encontraron usuarios con ese criterio de búsqueda.' : 'No hay usuarios de Telegram registrados todavía.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(u => (
                                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <code style={{ background: 'var(--surface-color)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.78rem' }}>
                                                        {u.telegram_user_id}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyId(u.telegram_user_id)}
                                                        className="icon-btn"
                                                        style={{ width: '22px', height: '22px', padding: 0 }}
                                                        title="Copiar Telegram ID"
                                                    >
                                                        {copiedId === u.telegram_user_id ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                        {`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Sin Nombre'}
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', color: 'var(--primary)' }}>
                                                        {u.telegram_username || 'Sin username'}
                                                    </span>
                                                    {u.is_linked ? (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            fontSize: '0.72rem',
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '4px',
                                                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                                            color: '#60A5FA',
                                                            fontWeight: 600,
                                                            width: 'fit-content'
                                                        }}>
                                                            <UserCheck size={12} />
                                                            SIPE: {u.sipe_nombre} ({u.sipe_role_name || 'Usuario'})
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            fontSize: '0.7rem',
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '4px',
                                                            backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                                            color: '#F59E0B',
                                                            width: 'fit-content'
                                                        }}>
                                                            <ShieldAlert size={12} />
                                                            Sin vincular a SIPE (Manual)
                                                        </span>
                                                    )}
                                                    {u.notas && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.1rem' }}>
                                                            {u.notas}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', fontSize: '0.8rem' }}>
                                                <button
                                                    onClick={() => handleToggleUserActive(u)}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '12px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                        color: u.activo ? '#10B981' : '#EF4444',
                                                        backgroundColor: u.activo ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                                                    }}
                                                    title={u.activo ? 'Clic para desactivar' : 'Clic para activar'}
                                                >
                                                    {u.activo ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                                    {u.activo ? 'Activo' : 'Inactivo'}
                                                </button>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                                    {u.is_linked && (
                                                        <span style={{
                                                            fontSize: '0.67rem',
                                                            color: '#60A5FA',
                                                            fontWeight: 600,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.02em'
                                                        }}>
                                                            Heredados de SIPE ({u.sipe_role_name})
                                                        </span>
                                                    )}
                                                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                        <span
                                                            style={{
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                background: (u.effective_permissions?.ventas ?? u.permiso_ventas) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.1)',
                                                                color: (u.effective_permissions?.ventas ?? u.permiso_ventas) ? '#10B981' : '#9CA3AF',
                                                                fontWeight: 600
                                                            }}
                                                            title="Permiso para consultar Ventas de Estaciones"
                                                        >
                                                            ⛽ Ventas
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                background: (u.effective_permissions?.saldos_banco ?? u.permiso_saldos_banco) ? 'rgba(59, 130, 246, 0.12)' : 'rgba(107, 114, 128, 0.1)',
                                                                color: (u.effective_permissions?.saldos_banco ?? u.permiso_saldos_banco) ? '#3B82F6' : '#9CA3AF',
                                                                fontWeight: 600
                                                            }}
                                                            title="Permiso para consultar Saldos en Bancos"
                                                        >
                                                            🏦 Bancos
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                background: (u.effective_permissions?.saldos_chequera ?? u.permiso_saldos_chequera) ? 'rgba(139, 92, 246, 0.12)' : 'rgba(107, 114, 128, 0.1)',
                                                                color: (u.effective_permissions?.saldos_chequera ?? u.permiso_saldos_chequera) ? '#8B5CF6' : '#9CA3AF',
                                                                fontWeight: 600
                                                            }}
                                                            title="Permiso para consultar Saldos en Chequeras"
                                                        >
                                                            🧾 Chequera
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                background: (u.effective_permissions?.alertas ?? u.permiso_alertas) ? 'rgba(245, 158, 11, 0.12)' : 'rgba(107, 114, 128, 0.1)',
                                                                color: (u.effective_permissions?.alertas ?? u.permiso_alertas) ? '#F59E0B' : '#9CA3AF',
                                                                fontWeight: 600
                                                            }}
                                                            title="Permiso para consultar Alertas Operativas"
                                                        >
                                                            🚨 Alertas
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                {u.last_interaction ? new Date(u.last_interaction).toLocaleString('es-SV', {
                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                }) : 'Sin interacciones'}
                                            </td>

                                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => handleOpenTestModal(u)}
                                                        title="Enviar mensaje de prueba a Telegram"
                                                    >
                                                        <Send size={15} color="#0088cc" />
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => handleOpenEdit(u)}
                                                        title={u.is_linked ? `Vinculado a SIPE: ${u.sipe_nombre} (${u.sipe_role_name || 'Rol'})` : 'Vincular con usuario de SIPE Admin'}
                                                        style={{ color: u.is_linked ? '#10B981' : '#F59E0B' }}
                                                    >
                                                        <UserCheck size={15} />
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => handleOpenEdit(u)}
                                                        title="Editar usuario y permisos"
                                                    >
                                                        <Edit2 size={15} color="var(--primary)" />
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => handleDeleteUser(u)}
                                                        title="Revocar acceso y eliminar usuario"
                                                    >
                                                        <Trash2 size={15} color="#EF4444" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'bitacora' && (
                /* Tab de Bitácora de Consultas */
                <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Registro Forense de Consultas vía Telegram (Últimas 100)</span>
                        <button
                            className="btn-secondary"
                            onClick={fetchBitacora}
                            disabled={loadingBitacora}
                            style={{ height: '30px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <RefreshCw size={13} className={loadingBitacora ? 'spin' : ''} /> Actualizar
                        </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fecha / Hora</th>
                                <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Usuario Telegram</th>
                                <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Telegram ID</th>
                                <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Comando / Consulta</th>
                                <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Autorizado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingBitacora ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Cargando registro de consultas...
                                    </td>
                                </tr>
                            ) : bitacora.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No hay registros de consultas en la bitácora aún.
                                    </td>
                                </tr>
                            ) : (
                                bitacora.map(b => (
                                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                            {new Date(b.created_at).toLocaleString('es-SV', {
                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                                            })}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {`${b.first_name || ''} ${b.last_name || ''}`.trim() || b.telegram_username || 'Desconocido'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.78rem' }}>
                                            <code>{b.telegram_user_id}</code>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)', marginRight: '0.5rem' }}>{b.comando}</span>
                                            {b.consulta && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>({b.consulta})</span>}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontWeight: 600,
                                                color: b.autorizado ? '#10B981' : '#EF4444',
                                                background: b.autorizado ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                                            }}>
                                                {b.autorizado ? 'Permitido' : 'Bloqueado'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'feedback' && (
                /* Tab de Retroalimentación & Mejora Continua */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Tarjeta de Salud del Bot */}
                    {renderBotHealthCard()}

                    {/* Tarjetas KPI de Satisfacción */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                width: '42px', height: '42px', borderRadius: '10px',
                                background: feedbackStats.tasa_satisfaccion >= 80 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: feedbackStats.tasa_satisfaccion >= 80 ? '#10B981' : '#EF4444',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem'
                            }}>
                                {feedbackStats.tasa_satisfaccion}%
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tasa de Satisfacción</div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    {feedbackStats.tasa_satisfaccion >= 80 ? 'Excelente 👍' : 'Requiere Ajustes ⚠️'}
                                </div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Evaluadas</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>{feedbackStats.total}</div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ThumbsUp size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Contestó Bien (Útil)</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10B981' }}>{feedbackStats.utiles}</div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ThumbsDown size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Por Mejorar / No Útil</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#EF4444' }}>{feedbackStats.no_utiles}</div>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Retroalimentación Forense */}
                    <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Registro Forense de Retroalimentación & Sugerencias</span>
                                <select
                                    value={feedbackFilter}
                                    onChange={e => setFeedbackFilter(e.target.value)}
                                    style={{ height: '30px', fontSize: '0.76rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', padding: '0 0.5rem' }}
                                >
                                    <option value="ALL">Todas las calificaciones</option>
                                    <option value="NO_UTIL">👎 Por Mejorar / No Útiles</option>
                                    <option value="UTIL">👍 Útiles / Bien contestadas</option>
                                    <option value="PENDIENTE">⏳ Pendientes de calificar</option>
                                </select>
                            </div>
                            <button
                                className="btn-secondary"
                                onClick={fetchFeedback}
                                disabled={loadingFeedback}
                                style={{ height: '30px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RefreshCw size={13} className={loadingFeedback ? 'spin' : ''} /> Actualizar
                            </button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fecha / Hora</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Usuario</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Pregunta / Consulta</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Calificación</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>¿Qué Esperaba o Qué Mejorar?</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Estado</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingFeedback ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Cargando retroalimentación de usuarios...
                                        </td>
                                    </tr>
                                ) : feedbacks.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No se han registrado calificaciones de usuarios todavía.
                                        </td>
                                    </tr>
                                ) : (
                                    feedbacks
                                        .filter(fb => feedbackFilter === 'ALL' || fb.calificacion === feedbackFilter)
                                        .map(fb => (
                                            <tr key={fb.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(fb.created_at).toLocaleString('es-SV', {
                                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{fb.first_name || fb.telegram_username || 'Usuario'}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID: <code>{fb.telegram_user_id}</code></div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', maxWidth: '250px' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>«{fb.consulta_original}»</span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        color: fb.calificacion === 'UTIL' ? '#10B981' : fb.calificacion === 'NO_UTIL' ? '#EF4444' : '#F59E0B',
                                                        background: fb.calificacion === 'UTIL' ? 'rgba(16, 185, 129, 0.12)' : fb.calificacion === 'NO_UTIL' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)'
                                                    }}>
                                                        {fb.calificacion === 'UTIL' ? '👍 Útil' : fb.calificacion === 'NO_UTIL' ? '👎 Por Mejorar' : '⏳ Pendiente'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', maxWidth: '300px' }}>
                                                    {fb.comentario_mejora ? (
                                                        <div style={{
                                                            background: 'rgba(239, 68, 68, 0.06)',
                                                            borderLeft: '3px solid #EF4444',
                                                            padding: '0.35rem 0.55rem',
                                                            borderRadius: '0 4px 4px 0',
                                                            fontSize: '0.78rem',
                                                            color: 'var(--text-main)'
                                                        }}>
                                                            <strong>💬 Esperaba:</strong> {fb.comentario_mejora}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Sin comentario específico</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 600,
                                                        color: fb.estado === 'REVISADO' ? '#10B981' : fb.estado === 'COMPLETADO' ? '#3B82F6' : '#F59E0B',
                                                        background: fb.estado === 'REVISADO' ? 'rgba(16, 185, 129, 0.1)' : fb.estado === 'COMPLETADO' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                                                    }}>
                                                        {fb.estado === 'REVISADO' ? 'Revisado' : fb.estado === 'COMPLETADO' ? 'Registrado' : 'Abierto'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                                    {fb.estado !== 'REVISADO' ? (
                                                        <button
                                                            className="btn-secondary"
                                                            onClick={() => handleMarkFeedbackReviewed(fb)}
                                                            title="Marcar como revisado en la mejora continua"
                                                            style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                        >
                                                            <Check size={12} color="#10B981" /> Revisar
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 600 }}>✓ Listo</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'diagnostico' && (
                /* Tab de Diagnóstico & Salud Forense */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Tarjeta de Salud del Bot */}
                    {renderBotHealthCard()}

                    {/* Tabla de Eventos y Errores Forenses (Buffer Circular) */}
                    <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Terminal size={15} color="var(--primary)" />
                                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        Buffer Forense de Errores e Incidentes (Últimos 50 Eventos en Memoria)
                                    </span>
                                </div>
                                <select
                                    value={errorFilter}
                                    onChange={e => setErrorFilter(e.target.value)}
                                    style={{
                                        height: '30px',
                                        fontSize: '0.76rem',
                                        borderRadius: 'var(--border-radius)',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-color)',
                                        color: 'var(--text-main)',
                                        padding: '0 0.5rem'
                                    }}
                                >
                                    <option value="ALL">Todos los eventos ({forensicErrors.length})</option>
                                    <option value="CRITICAL">🔴 Críticos</option>
                                    <option value="ERROR">🟠 Errores</option>
                                    <option value="WARNING">🟡 Advertencias</option>
                                    <option value="POLLING_ERROR">📡 Errores Polling</option>
                                    <option value="AI_ERROR">🧠 Errores IA (Gemini)</option>
                                    <option value="QUERY_ERROR">❓ Errores de Consulta</option>
                                    <option value="VOICE_ERROR">🎙️ Errores de Voz</option>
                                    <option value="DB_ERROR">🗄️ Errores de Base de Datos</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={fetchForensicErrors}
                                    disabled={loadingErrors}
                                    style={{ height: '30px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <RefreshCw size={13} className={loadingErrors ? 'spin' : ''} /> Actualizar
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={handleClearForensicErrors}
                                    disabled={clearingErrors || forensicErrors.length === 0}
                                    style={{
                                        height: '30px',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        color: '#EF4444',
                                        borderColor: 'rgba(239, 68, 68, 0.3)'
                                    }}
                                    title="Limpiar buffer de memoria"
                                >
                                    <AlertTriangle size={13} /> Limpiar Buffer
                                </button>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fecha / Hora</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Severidad</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tipo</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Usuario / Origen</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Mensaje / Causa</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Consulta Disparadora</th>
                                    <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingErrors ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Cargando registro de eventos forenses...
                                        </td>
                                    </tr>
                                ) : forensicErrors.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                                                <CheckCircle2 size={28} color="#10B981" />
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                                                    El buffer circular de auditoría forense se encuentra completamente limpio.
                                                </div>
                                                <div style={{ fontSize: '0.76rem' }}>
                                                    Cero excepciones, caídas o fallos registrados en las sesiones del bot.
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    forensicErrors
                                        .filter(e => {
                                            if (errorFilter === 'ALL') return true;
                                            if (errorFilter === 'CRITICAL') return e.severity === 'critical';
                                            if (errorFilter === 'ERROR') return e.severity === 'error';
                                            if (errorFilter === 'WARNING') return e.severity === 'warning';
                                            return e.type === errorFilter;
                                        })
                                        .map(e => {
                                            const isCrit = e.severity === 'critical';
                                            const isWarn = e.severity === 'warning';
                                            const badgeBg = isCrit ? 'rgba(220, 38, 38, 0.15)' : isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.12)';
                                            const badgeColor = isCrit ? '#DC2626' : isWarn ? '#F59E0B' : '#EF4444';

                                            return (
                                                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {new Date(e.timestamp).toLocaleString('es-SV', {
                                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                        })}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            fontWeight: 700,
                                                            textTransform: 'uppercase',
                                                            background: badgeBg,
                                                            color: badgeColor
                                                        }}>
                                                            {e.severity}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.78rem' }}>
                                                        <code>{e.type}</code>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.78rem' }}>
                                                        {e.userId ? <span>ID: <code>{e.userId}</code></span> : (e.chatId ? <span>Chat: <code>{e.chatId}</code></span> : <span style={{ color: 'var(--text-muted)' }}>Sistema</span>)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', maxWidth: '300px' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                            {e.message}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', fontSize: '0.78rem', maxWidth: '240px' }}>
                                                        {e.query ? (
                                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                                «{e.query.slice(0, 60)}{e.query.length > 60 ? '...' : ''}»
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                                        <button
                                                            className="btn-secondary"
                                                            onClick={() => {
                                                                setSelectedError(e);
                                                                setErrorDetailModalOpen(true);
                                                            }}
                                                            title="Ver stack trace e inspección forense"
                                                            style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                        >
                                                            <Eye size={12} /> Detalle
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

            {/* Modal de Usuario (Crear / Editar) */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingUser ? `Editar Usuario de Telegram: ${formData.first_name || formData.telegram_user_id}` : 'Registrar Nuevo Usuario de Telegram'}
                size="md"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', width: '100%' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setModalOpen(false)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="telegram-user-form"
                            className="btn-primary"
                            disabled={saving}
                            style={{ height: '36px', fontSize: '0.825rem', minWidth: '100px' }}
                        >
                            {saving ? 'Guardando...' : (editingUser ? 'Actualizar' : 'Guardar')}
                        </button>
                    </div>
                }
            >
                <form id="telegram-user-form" onSubmit={handleSubmitUser}>
                    <div className="form-grid form-grid-2">
                        {/* Selector de Vinculación con SIPE Admin */}
                        <div className="form-group span-2" style={{
                            background: 'var(--surface-color)',
                            border: formData.user_id ? '1px solid rgba(59, 130, 246, 0.4)' : '1px dashed var(--border)',
                            borderRadius: '8px',
                            padding: '0.85rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                                    <UserCheck size={16} color={formData.user_id ? '#3B82F6' : 'var(--text-muted)'} />
                                    Vincular con Usuario del Sistema SIPE Admin
                                </label>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <button
                                        type="button"
                                        onClick={fetchSystemUsers}
                                        className="icon-btn"
                                        title="Recargar usuarios de SIPE Admin"
                                        style={{ width: '24px', height: '24px', padding: 0 }}
                                    >
                                        <RefreshCw size={13} className={loadingSystemUsers ? 'spin' : ''} />
                                    </button>
                                    {formData.user_id ? (
                                        <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '0.12rem 0.45rem', borderRadius: '4px' }}>
                                            ✓ Vinculado
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            (Opcional)
                                        </span>
                                    )}
                                </div>
                            </div>

                            <select
                                value={formData.user_id || ''}
                                onChange={e => handleSystemUserSelect(e.target.value)}
                                disabled={loadingSystemUsers}
                                style={{
                                    width: '100%',
                                    height: '38px',
                                    fontSize: '0.825rem',
                                    padding: '0 0.65rem',
                                    borderRadius: 'var(--border-radius)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-color)',
                                    color: 'var(--text-main)'
                                }}
                            >
                                <option value="">
                                    {loadingSystemUsers ? '-- Cargando usuarios de SIPE... --' : '-- Sin vincular a SIPE (Permisos manuales) --'}
                                </option>
                                {systemUsers.map(su => (
                                    <option key={su.id} value={su.id}>
                                        {su.nombre} ({su.username}) — Rol: {su.role_name}
                                    </option>
                                ))}
                            </select>

                            {selectedSystemUser ? (
                                <div style={{
                                    padding: '0.65rem 0.75rem',
                                    borderRadius: '6px',
                                    background: 'rgba(59, 130, 246, 0.06)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.4rem',
                                    marginTop: '0.2rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Rol: <span style={{ color: '#3B82F6' }}>{selectedSystemUser.role_name}</span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {selectedSystemUser.email || selectedSystemUser.username}
                                        </span>
                                    </div>

                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(formData.heredar_permisos)}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    heredar_permisos: checked,
                                                    ...(checked ? {
                                                        permiso_ventas: selectedSystemUser.permissions?.ventas ? 1 : 0,
                                                        permiso_saldos_banco: selectedSystemUser.permissions?.saldos_banco ? 1 : 0,
                                                        permiso_saldos_chequera: selectedSystemUser.permissions?.saldos_chequera ? 1 : 0,
                                                        permiso_alertas: selectedSystemUser.permissions?.alertas ? 1 : 0
                                                    } : {})
                                                }));
                                            }}
                                            style={{ width: '16px', height: '16px' }}
                                        />
                                        Heredar automáticamente permisos de consultas según rol en SIPE Admin
                                    </label>

                                    {formData.heredar_permisos && (
                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.1rem' }}>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Consultas permitidas:</span>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                                background: selectedSystemUser.permissions?.ventas ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                                color: selectedSystemUser.permissions?.ventas ? '#10B981' : '#9CA3AF'
                                            }}>
                                                {selectedSystemUser.permissions?.ventas ? '✓ Ventas' : '✗ Ventas'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                                background: selectedSystemUser.permissions?.saldos_banco ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                                color: selectedSystemUser.permissions?.saldos_banco ? '#3B82F6' : '#9CA3AF'
                                            }}>
                                                {selectedSystemUser.permissions?.saldos_banco ? '✓ Bancos' : '✗ Bancos'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                                background: selectedSystemUser.permissions?.saldos_chequera ? 'rgba(139, 92, 246, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                                color: selectedSystemUser.permissions?.saldos_chequera ? '#8B5CF6' : '#9CA3AF'
                                            }}>
                                                {selectedSystemUser.permissions?.saldos_chequera ? '✓ Chequera' : '✗ Chequera'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                                background: selectedSystemUser.permissions?.alertas ? 'rgba(245, 158, 11, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                                                color: selectedSystemUser.permissions?.alertas ? '#F59E0B' : '#9CA3AF'
                                            }}>
                                                {selectedSystemUser.permissions?.alertas ? '✓ Alertas' : '✗ Alertas'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    💡 Vincula este usuario de Telegram con su cuenta de SIPE Admin para que sus permisos se hereden dinámicamente y no tengas que parametrizarlo manualmente.
                                </span>
                            )}
                        </div>

                        <div className="form-group span-2">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
                                Telegram User ID (Numérico) *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ej: 1234567890"
                                value={formData.telegram_user_id}
                                onChange={e => setFormData({ ...formData, telegram_user_id: e.target.value })}
                                disabled={Boolean(editingUser)}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.65rem' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                                El usuario puede obtener su ID enviando cualquier mensaje al bot @SIPE_IA_BOT.
                            </span>
                        </div>

                        <div className="form-group">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
                                Nombre
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: Carlos"
                                value={formData.first_name}
                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.65rem' }}
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
                                Apellido
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: Morales"
                                value={formData.last_name}
                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.65rem' }}
                            />
                        </div>

                        <div className="form-group span-2">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
                                Username de Telegram (Opcional)
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: cmorales (sin @)"
                                value={formData.telegram_username}
                                onChange={e => setFormData({ ...formData, telegram_username: e.target.value })}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.65rem' }}
                            />
                        </div>

                        <div className="form-group span-2">
                            <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                fontSize: '0.825rem',
                                userSelect: 'none',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(formData.activo)}
                                    onChange={e => setFormData({ ...formData, activo: e.target.checked ? 1 : 0 })}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                Usuario Autorizado / Activo (Permite recibir respuestas del bot)
                            </label>
                        </div>

                        {/* Selección de Permisos de Consulta */}
                        <div className="form-group span-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Permisos Granulares de Consulta:
                                </span>
                                {formData.heredar_permisos && formData.user_id ? (
                                    <span style={{ fontSize: '0.72rem', color: '#3B82F6', fontWeight: 600 }}>
                                        (Heredados automáticamente según rol en SIPE Admin)
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        (Configuración manual personalizada)
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                                <label style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    fontSize: '0.8rem',
                                    cursor: (formData.heredar_permisos && formData.user_id) ? 'not-allowed' : 'pointer',
                                    opacity: (formData.heredar_permisos && formData.user_id) ? 0.75 : 1
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(formData.permiso_ventas)}
                                        disabled={Boolean(formData.heredar_permisos && formData.user_id)}
                                        onChange={e => setFormData({ ...formData, permiso_ventas: e.target.checked ? 1 : 0 })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    ⛽ Ventas de Estaciones (/ventas)
                                </label>

                                <label style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    fontSize: '0.8rem',
                                    cursor: (formData.heredar_permisos && formData.user_id) ? 'not-allowed' : 'pointer',
                                    opacity: (formData.heredar_permisos && formData.user_id) ? 0.75 : 1
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(formData.permiso_saldos_banco)}
                                        disabled={Boolean(formData.heredar_permisos && formData.user_id)}
                                        onChange={e => setFormData({ ...formData, permiso_saldos_banco: e.target.checked ? 1 : 0 })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    🏦 Saldo en Banco (/bancos)
                                </label>

                                <label style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    fontSize: '0.8rem',
                                    cursor: (formData.heredar_permisos && formData.user_id) ? 'not-allowed' : 'pointer',
                                    opacity: (formData.heredar_permisos && formData.user_id) ? 0.75 : 1
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(formData.permiso_saldos_chequera)}
                                        disabled={Boolean(formData.heredar_permisos && formData.user_id)}
                                        onChange={e => setFormData({ ...formData, permiso_saldos_chequera: e.target.checked ? 1 : 0 })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    🧾 Saldo en Chequera (/chequera)
                                </label>

                                <label style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    fontSize: '0.8rem',
                                    cursor: (formData.heredar_permisos && formData.user_id) ? 'not-allowed' : 'pointer',
                                    opacity: (formData.heredar_permisos && formData.user_id) ? 0.75 : 1
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(formData.permiso_alertas)}
                                        disabled={Boolean(formData.heredar_permisos && formData.user_id)}
                                        onChange={e => setFormData({ ...formData, permiso_alertas: e.target.checked ? 1 : 0 })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    🚨 Alertas en Estaciones (/alertas)
                                </label>
                            </div>
                        </div>

                        <div className="form-group span-2">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
                                Notas u Observaciones
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: Gerente General / Acceso aprobado por Presidencia"
                                value={formData.notas}
                                onChange={e => setFormData({ ...formData, notas: e.target.value })}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.65rem' }}
                            />
                        </div>
                    </div>
                </form>
            </Modal>

            {/* Modal de Envío de Mensaje de Prueba */}
            <Modal
                open={testModalOpen}
                onClose={() => setTestModalOpen(false)}
                title={`Enviar Mensaje Directo a ${testTargetUser?.first_name || 'Usuario'}`}
                size="md"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', width: '100%' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setTestModalOpen(false)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSendTestMessage}
                            disabled={sendingTest || !testMessageText}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            {sendingTest ? 'Enviando...' : 'Enviar por Telegram'}
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Destinatario: <strong>{testTargetUser?.first_name} {testTargetUser?.last_name}</strong> (ID: <code>{testTargetUser?.telegram_user_id}</code>)
                    </div>
                    <textarea
                        rows={4}
                        value={testMessageText}
                        onChange={e => setTestMessageText(e.target.value)}
                        placeholder="Escribe el mensaje que deseas enviar..."
                        style={{
                            width: '100%',
                            padding: '0.65rem',
                            fontSize: '0.825rem',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-color)',
                            color: 'var(--text-main)',
                            outline: 'none',
                            resize: 'vertical'
                        }}
                    />
                </div>
            </Modal>

            {/* Modal de Inspección Forense de Error */}
            <Modal
                open={errorDetailModalOpen}
                onClose={() => setErrorDetailModalOpen(false)}
                title={selectedError ? `Inspección Forense: ${selectedError.type}` : 'Detalle del Error'}
                size="lg"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setErrorDetailModalOpen(false)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            Cerrar
                        </button>
                    </div>
                }
            >
                {selectedError && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                            <div style={{ padding: '0.5rem 0.75rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Identificador</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}><code>{selectedError.id}</code></div>
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timestamp</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{new Date(selectedError.timestamp).toLocaleString('es-SV')}</div>
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Severidad / Tipo</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '3px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        background: selectedError.severity === 'critical' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(239, 68, 68, 0.12)',
                                        color: selectedError.severity === 'critical' ? '#DC2626' : '#EF4444'
                                    }}>
                                        {selectedError.severity}
                                    </span>
                                    <code>{selectedError.type}</code>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Usuario / Chat</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                    {selectedError.userId ? `User: ${selectedError.userId}` : ''} {selectedError.chatId ? `(Chat: ${selectedError.chatId})` : 'Sistema'}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                                Mensaje de Error
                            </div>
                            <div style={{
                                padding: '0.65rem 0.85rem',
                                background: 'rgba(239, 68, 68, 0.08)',
                                borderLeft: '3px solid #EF4444',
                                borderRadius: '0 6px 6px 0',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--text-main)'
                            }}>
                                {selectedError.message}
                            </div>
                        </div>

                        {selectedError.query && (
                            <div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    Consulta Disparadora
                                </div>
                                <div style={{ padding: '0.55rem 0.75rem', background: 'var(--surface-color)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.825rem', fontStyle: 'italic' }}>
                                    «{selectedError.query}»
                                </div>
                            </div>
                        )}

                        {selectedError.stack && (
                            <div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    Stack Trace Forense
                                </div>
                                <pre style={{
                                    margin: 0,
                                    padding: '0.75rem',
                                    borderRadius: '6px',
                                    background: '#1e293b',
                                    color: '#f8fafc',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    overflowX: 'auto',
                                    maxHeight: '220px'
                                }}>
                                    {selectedError.stack}
                                </pre>
                            </div>
                        )}

                        {selectedError.details && (
                            <div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                                    Metadatos Adicionales
                                </div>
                                <pre style={{
                                    margin: 0,
                                    padding: '0.65rem',
                                    borderRadius: '6px',
                                    background: 'var(--surface-color)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    overflowX: 'auto'
                                }}>
                                    {JSON.stringify(selectedError.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
