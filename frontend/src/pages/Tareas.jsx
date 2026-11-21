import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import socket from '../services/socket';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import MibotProgramarModal, {
    MIBOT_TIPO_OPTIONS,
    formatMibotDateTime,
    getDeliveryBadgeStyle
} from '../components/MibotProgramarModal';
import * as XLSX from 'xlsx';
import {
    ClipboardCheck,
    Plus,
    Search,
    RefreshCw,
    LayoutGrid,
    List,
    Clock,
    AlertCircle,
    CheckCircle2,
    Calendar,
    User,
    Tag,
    MessageSquare,
    Trash2,
    Edit2,
    Eye,
    ChevronRight,
    Send,
    PlayCircle,
    PauseCircle,
    Download,
    Flame,
    Bot,
    Bell,
    XCircle,
    Users,
    X
} from 'lucide-react';

const COLUMNS = [
    { id: 'pendiente', title: 'Pendientes', color: '#f59e0b', bgLight: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b' },
    { id: 'en_proceso', title: 'En Proceso', color: '#3b82f6', bgLight: 'rgba(59, 130, 246, 0.08)', border: '#3b82f6' },
    { id: 'en_revision', title: 'En Revisión', color: '#8b5cf6', bgLight: 'rgba(139, 92, 246, 0.08)', border: '#8b5cf6' },
    { id: 'completada', title: 'Completadas', color: '#10b981', bgLight: 'rgba(16, 185, 129, 0.08)', border: '#10b981' }
];

const CATEGORIAS = ['General', 'Operaciones', 'Mantenimiento', 'Administrativo', 'Finanzas', 'Sistemas'];

export default function Tareas() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    // User session
    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch {
            return {};
        }
    }, []);
    const isAdmin = currentUser.role_id === 1 || currentUser.role === 'Administrator' || currentUser.role_name === 'Administrator';

    // State
    const [tasks, setTasks] = useState([]);
    const [kpis, setKpis] = useState({ total: 0, pendientes: 0, en_proceso: 0, en_revision: 0, completadas: 0, vencidas: 0, vence_hoy: 0 });
    const [usersList, setUsersList] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table' | 'mibot'

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPrioridad, setFilterPrioridad] = useState('todas');
    const [filterCategoria, setFilterCategoria] = useState('todas');
    const [filterUser, setFilterUser] = useState('');
    const [soloMias, setSoloMias] = useState(false);

    // MiBot Telegram Immersed State
    const [mibotRecipients, setMibotRecipients] = useState([]);
    const [mibotProgramaciones, setMibotProgramaciones] = useState([]);
    const [loadingMibot, setLoadingMibot] = useState(false);
    const [mibotTipoFilter, setMibotTipoFilter] = useState('ALL');
    const [mibotEstadoFilter, setMibotEstadoFilter] = useState('ALL');
    const [sendingMibotId, setSendingMibotId] = useState(null);
    const [mibotModalOpen, setMibotModalOpen] = useState(false);
    const [mibotTargetTask, setMibotTargetTask] = useState(null);
    const [mibotDefaultTipo, setMibotDefaultTipo] = useState('TAREA');

    // Tarjeta Informativa de Asignación en Sistema
    const [recentAssignedCard, setRecentAssignedCard] = useState(null);
    const [showMyAssignedBanner, setShowMyAssignedBanner] = useState(true);

    // Modals
    const [showModalForm, setShowModalForm] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [formData, setFormData] = useState({
        titulo: '',
        descripcion: '',
        tipo_plazo: 'dia_especifico',
        fecha_inicio: '',
        fecha_vencimiento: '',
        hora_limite: '',
        prioridad: 'media',
        categoria: 'General',
        assigned_to: '',
        assigned_to_ids: [],
        checklist: [],
        mibot_enabled: false,
        mibot_tipo: 'TAREA',
        mibot_destinatario_ids: [],
        mibot_enviar_ahora: true,
        mibot_fecha: '',
        mibot_hora: '08:00',
        mibot_frecuencia: 'UNA_VEZ'
    });
    const [newSubtaskText, setNewSubtaskText] = useState('');

    // Detail & Comments Modal
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [taskComments, setTaskComments] = useState([]);
    const [newCommentText, setNewCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // Drag & Drop State
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [dragOverColumn, setDragOverColumn] = useState(null);

    const fetchMibotRecipients = useCallback(async () => {
        try {
            const res = await api.get('/telegram/mibot/destinatarios');
            setMibotRecipients(Array.isArray(res.data?.destinatarios) ? res.data.destinatarios : []);
        } catch (_) {
            setMibotRecipients([]);
        }
    }, []);

    const fetchMibotProgramaciones = useCallback(async () => {
        setLoadingMibot(true);
        try {
            const params = { limit: 80 };
            if (mibotTipoFilter && mibotTipoFilter !== 'ALL') params.tipo = mibotTipoFilter;
            if (mibotEstadoFilter && mibotEstadoFilter !== 'ALL') params.estado = mibotEstadoFilter;
            const res = await api.get('/telegram/mibot/programaciones', { params });
            setMibotProgramaciones(Array.isArray(res.data?.programaciones) ? res.data.programaciones : []);
        } catch (_) {
            setMibotProgramaciones([]);
        } finally {
            setLoadingMibot(false);
        }
    }, [mibotTipoFilter, mibotEstadoFilter]);

    // Load initial data
    const fetchTasks = useCallback(async (isSilent = false) => {
        if (!isSilent) setRefreshing(true);
        try {
            const params = {};
            if (soloMias) params.solo_mias = 'true';
            if (filterUser) params.assigned_to = filterUser;
            if (filterPrioridad !== 'todas') params.prioridad = filterPrioridad;
            if (filterCategoria !== 'todas') params.categoria = filterCategoria;
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const [tasksRes, kpisRes] = await Promise.all([
                api.get('/tasks', { params }),
                api.get('/tasks/kpis/summary', { params })
            ]);

            setTasks(tasksRes.data || []);
            setKpis(kpisRes.data || {});
        } catch (error) {
            console.error('Error fetching tasks:', error);
            addToast('Error al cargar la lista de tareas', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [soloMias, filterUser, filterPrioridad, filterCategoria, searchTerm, addToast]);

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            try {
                const res = await api.get('/tasks/collaborators');
                const data = Array.isArray(res.data) ? res.data : [];
                if (data.length > 0) {
                    setUsersList(data);
                    return;
                }
            } catch (error) {
                console.error('Error fetching collaborators from /tasks/collaborators:', error);
            }

            try {
                const fallbackRes = await api.get('/users');
                const fbData = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
                if (fbData.length > 0) {
                    setUsersList(fbData);
                    return;
                }
            } catch (fbErr) {
                console.error('Error fetching users fallback:', fbErr);
            }

            // Si la carga falla o está en curso, garantizar que al menos el usuario en sesión pueda auto-asignarse
            if (currentUser && currentUser.id) {
                setUsersList([{
                    id: currentUser.id,
                    username: currentUser.username || 'usuario',
                    nombre: currentUser.nombre || currentUser.username || 'Mi Usuario',
                    role_name: currentUser.role_name || currentUser.role || 'Colaborador'
                }]);
            }
        } finally {
            setUsersLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        fetchUsers();
        fetchMibotRecipients();
    }, [fetchUsers, fetchMibotRecipients]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    useEffect(() => {
        fetchMibotProgramaciones();
    }, [fetchMibotProgramaciones]);

    // Socket real-time synchronization & informative card listener
    useEffect(() => {
        const handleTasksChanged = () => {
            fetchTasks(true);
            fetchMibotProgramaciones();
        };

        const handleCommentAdded = (data) => {
            if (selectedTask && selectedTask.id === data.taskId) {
                setTaskComments(prev => [...prev, data.comment]);
            }
            fetchTasks(true);
        };

        const handleTaskAssignedCard = (payload) => {
            if (payload?.task) {
                setRecentAssignedCard({
                    task: payload.task,
                    mibot: payload.mibot || null,
                    timestamp: new Date().toISOString()
                });
            }
            fetchTasks(true);
            fetchMibotProgramaciones();
        };

        socket.on('tasks:changed', handleTasksChanged);
        socket.on('tasks:comment_added', handleCommentAdded);
        socket.on('tasks:assigned_card', handleTaskAssignedCard);

        return () => {
            socket.off('tasks:changed', handleTasksChanged);
            socket.off('tasks:comment_added', handleCommentAdded);
            socket.off('tasks:assigned_card', handleTaskAssignedCard);
        };
    }, [fetchTasks, fetchMibotProgramaciones, selectedTask]);

    // Listener for opening a task detail directly from system notification card
    useEffect(() => {
        const onOpenTaskDetail = (e) => {
            const taskId = e.detail?.taskId;
            if (!taskId) return;
            const found = tasks.find(t => Number(t.id) === Number(taskId));
            if (found) {
                handleOpenDetail(found);
            } else {
                api.get(`/tasks/${taskId}`).then(res => {
                    if (res.data) {
                        setSelectedTask(res.data);
                        setTaskComments(res.data.comments || []);
                        setShowDetailModal(true);
                    }
                }).catch(() => {});
            }
        };
        window.addEventListener('sipe:open-task-detail', onOpenTaskDetail);
        return () => window.removeEventListener('sipe:open-task-detail', onOpenTaskDetail);
    }, [tasks]);

    // Mis Tareas y Actividades Asignadas Activas para la Tarjeta Informativa
    const myAssignedTasks = useMemo(() => {
        if (!currentUser?.id) return [];
        return (tasks || []).filter(t =>
            Number(t.assigned_to) === Number(currentUser.id) &&
            t.estado !== 'completada' &&
            t.estado !== 'cancelada'
        );
    }, [tasks, currentUser]);

    // Helper: Calculate deadline status
    const getDeadlineBadge = (task) => {
        if (task.estado === 'completada') {
            return {
                label: 'Completada',
                bg: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                border: '#10b981',
                isOverdue: false
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const cleanStr = String(task.fecha_vencimiento || '').split('T')[0];
        const [y, m, d] = cleanStr.split('-').map(Number);
        if (!y || !m || !d) return { label: 'Sin fecha', bg: '#f1f5f9', color: '#64748b' };

        const dueDate = new Date(y, m - 1, d);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                label: `Atrasada (${Math.abs(diffDays)}d)`,
                bg: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                border: '#ef4444',
                isOverdue: true
            };
        }
        if (diffDays === 0) {
            return {
                label: 'Vence Hoy',
                bg: 'rgba(245, 158, 11, 0.15)',
                color: '#b45309',
                border: '#f59e0b',
                isOverdue: false
            };
        }
        if (diffDays === 1) {
            return {
                label: 'Mañana',
                bg: 'rgba(59, 130, 246, 0.12)',
                color: '#2563eb',
                border: '#3b82f6',
                isOverdue: false
            };
        }
        return {
            label: `${diffDays} días rest.`,
            bg: 'rgba(100, 116, 139, 0.1)',
            color: '#475569',
            border: '#94a3b8',
            isOverdue: false
        };
    };

    // Helper: Priority color & style
    const getPriorityBadge = (prioridad) => {
        switch (prioridad) {
            case 'urgente':
                return { label: 'URGENTE', bg: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', border: '#ef4444', isUrgent: true };
            case 'alta':
                return { label: 'ALTA', bg: 'rgba(249, 115, 22, 0.15)', color: '#c2410c', border: '#f97316' };
            case 'media':
                return { label: 'MEDIA', bg: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8', border: '#3b82f6' };
            case 'baja':
            default:
                return { label: 'BAJA', bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: '#cbd5e1' };
        }
    };

    // Helper: Format date
    const formatDateSpanish = (dateStr) => {
        if (!dateStr) return '';
        const cleanStr = String(dateStr).split('T')[0];
        const [y, m, d] = cleanStr.split('-').map(Number);
        if (!y || !m || !d) return String(dateStr);
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${d} ${months[m - 1]} ${y}`;
    };

    // Helper: Format time into 12-hour format ("05:00 PM")
    const formatTimeSpanish = (timeStr) => {
        if (!timeStr) return '';
        const parts = String(timeStr).split(':');
        if (parts.length < 2) return String(timeStr);
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1].substring(0, 2);
        if (isNaN(hours)) return String(timeStr);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const strHours = String(hours).padStart(2, '0');
        return `${strHours}:${minutes} ${ampm}`;
    };

    // Helper: Format datetime for comments and logs ("20 sep 2026, 11:45 AM")
    const formatDateTimeSpanish = (dateTimeStr) => {
        if (!dateTimeStr) return '';
        try {
            const d = new Date(dateTimeStr);
            if (isNaN(d.getTime())) return String(dateTimeStr);
            const day = d.getDate();
            const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const month = months[d.getMonth()];
            const year = d.getFullYear();
            let hours = d.getHours();
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const strHours = String(hours).padStart(2, '0');
            return `${day} ${month} ${year}, ${strHours}:${minutes} ${ampm}`;
        } catch {
            return String(dateTimeStr);
        }
    };

    // Drag & Drop handlers
    const handleDragStart = (e, taskId) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, colId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverColumn !== colId) {
            setDragOverColumn(colId);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOverColumn(null);
    };

    const handleDrop = async (e, targetStatus) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
        setDragOverColumn(null);
        setDraggedTaskId(null);

        if (!taskId) return;

        const currentTask = tasks.find(t => String(t.id) === String(taskId));
        if (!currentTask || currentTask.estado === targetStatus) return;

        // Optimistic UI update
        setTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, estado: targetStatus } : t));

        try {
            await api.patch(`/tasks/${taskId}/status`, { estado: targetStatus });
            addToast(`Tarea movida a "${COLUMNS.find(c => c.id === targetStatus)?.title || targetStatus}"`, 'success');
            fetchTasks(true);
        } catch (err) {
            console.error('Error changing status:', err);
            addToast('Error al actualizar estado de la tarea', 'error');
            fetchTasks(true);
        }
    };

    // Fast status changer (for mobile or buttons)
    const handleQuickStatusChange = async (taskId, newStatus) => {
        try {
            await api.patch(`/tasks/${taskId}/status`, { estado: newStatus });
            addToast(`Estado actualizado con éxito`, 'success');
            fetchTasks(true);
            if (selectedTask && selectedTask.id === taskId) {
                setSelectedTask(prev => ({ ...prev, estado: newStatus }));
            }
        } catch (err) {
            console.error(err);
            addToast('Error al actualizar estado', 'error');
        }
    };

    // Toggle checklist item
    const handleToggleChecklist = async (task, itemIndex) => {
        const updatedChecklist = [...(task.checklist || [])];
        if (!updatedChecklist[itemIndex]) return;

        updatedChecklist[itemIndex] = {
            ...updatedChecklist[itemIndex],
            completado: !updatedChecklist[itemIndex].completado
        };

        // Optimistic update
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, checklist: updatedChecklist } : t));
        if (selectedTask && selectedTask.id === task.id) {
            setSelectedTask(prev => ({ ...prev, checklist: updatedChecklist }));
        }

        try {
            await api.patch(`/tasks/${task.id}/checklist`, { checklist: updatedChecklist });
        } catch (err) {
            console.error(err);
            addToast('Error al actualizar subtarea', 'error');
            fetchTasks(true);
        }
    };

    // Helper: Find linked Telegram recipient ID for a SIPE Admin userId
    const getLinkedTelegramIdForUser = useCallback((sipeUserId) => {
        if (!sipeUserId) return null;
        const numId = Number(sipeUserId);
        const fromRecipients = mibotRecipients.find(r => Number(r.user_id) === numId);
        if (fromRecipients) return Number(fromRecipients.id);
        const fromUsers = usersList.find(u => Number(u.id) === numId && u.telegram_usuario_id);
        if (fromUsers) return Number(fromUsers.telegram_usuario_id);
        return null;
    }, [mibotRecipients, usersList]);

    // Helper: Get MiBot status badge for a task
    const getTaskMibotBadge = (task) => {
        const ms = task?.mibot_summary;
        if (!ms || !ms.has_mibot) return null;
        const dests = Array.isArray(ms.destinatarios) ? ms.destinatarios : [];
        const hasValidado = dests.some(d => d.estado_entrega === 'VALIDADO') || ms.ultimo_estado === 'COMPLETADO';
        const hasVisto = dests.some(d => d.estado_entrega === 'VISTO');
        const hasEnviado = dests.some(d => d.estado_entrega === 'ENVIADO') || ms.ultimo_estado === 'ENVIADO';
        if (hasValidado) {
            return { label: '🤖 MiBot: ✔️ Validado', color: '#34d399', bg: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.4)' };
        }
        if (hasVisto) {
            return { label: '🤖 MiBot: 👀 Visto', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.4)' };
        }
        if (hasEnviado) {
            return { label: '🤖 MiBot: 📩 Enviado', color: '#a5b4fc', bg: 'rgba(99, 102, 241, 0.18)', border: 'rgba(99, 102, 241, 0.4)' };
        }
        return { label: '🤖 MiBot: ⏰ Agendado', color: '#38bdf8', bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(14, 165, 233, 0.35)' };
    };

    // Open MiBot scheduling modal (either for a specific task or general activity/meeting)
    const handleOpenMibotModal = (task = null, defaultTipo = 'TAREA') => {
        setMibotTargetTask(task);
        setMibotDefaultTipo(defaultTipo);
        setMibotModalOpen(true);
    };

    const handleSendMibotNow = async (prog) => {
        setSendingMibotId(prog.id);
        try {
            const res = await api.post(`/telegram/mibot/programaciones/${prog.id}/enviar-ahora`);
            addToast(res.data?.message || 'Aviso enviado personalmente por Telegram', 'success');
            fetchMibotProgramaciones();
            fetchTasks(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al enviar aviso MiBot', 'error');
        } finally {
            setSendingMibotId(null);
        }
    };

    const handleChangeMibotEstado = async (prog, nuevoEstado) => {
        const msg = nuevoEstado === 'CANCELADO'
            ? `¿Cancelar la programación MiBot "${prog.titulo}"?`
            : `¿Cambiar estado de "${prog.titulo}" a ${nuevoEstado}?`;
        if (!await confirm(msg, nuevoEstado === 'CANCELADO' ? { variant: 'danger' } : {})) return;
        try {
            await api.patch(`/telegram/mibot/programaciones/${prog.id}/estado`, { estado: nuevoEstado });
            addToast(`Programación MiBot actualizada a ${nuevoEstado}`, 'success');
            fetchMibotProgramaciones();
            fetchTasks(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al actualizar programación MiBot', 'error');
        }
    };

    const handleDeleteMibotProg = async (prog) => {
        if (!await confirm(`¿Eliminar definitivamente la programación MiBot "${prog.titulo}"?`, { variant: 'danger' })) return;
        try {
            await api.delete(`/telegram/mibot/programaciones/${prog.id}`);
            addToast('Programación MiBot eliminada', 'success');
            fetchMibotProgramaciones();
            fetchTasks(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar programación MiBot', 'error');
        }
    };

    // Handle collaborator change in form (auto-select linked Telegram user for MiBot)
    const handleAssignedUserChange = (newAssignedUserId) => {
        const linkedTgId = getLinkedTelegramIdForUser(newAssignedUserId);
        setFormData(prev => ({
            ...prev,
            assigned_to: newAssignedUserId,
            mibot_enabled: linkedTgId ? true : prev.mibot_enabled,
            mibot_destinatario_ids: linkedTgId
                ? [...new Set([linkedTgId, ...prev.mibot_destinatario_ids])]
                : prev.mibot_destinatario_ids
        }));
    };

    const toggleExtraAssignedUser = (rawUserId) => {
        const uid = Number(rawUserId);
        if (!uid) return;
        const linkedTgId = getLinkedTelegramIdForUser(uid);
        setFormData(prev => {
            const currentExtras = Array.isArray(prev.assigned_to_ids) ? prev.assigned_to_ids.map(Number) : [];
            const exists = currentExtras.includes(uid);
            const nextExtras = exists
                ? currentExtras.filter(x => x !== uid)
                : [...currentExtras, uid];
            const nextMibotDests = !exists && linkedTgId
                ? [...new Set([...prev.mibot_destinatario_ids, linkedTgId])]
                : prev.mibot_destinatario_ids;
            return {
                ...prev,
                assigned_to_ids: nextExtras,
                mibot_enabled: (!exists && linkedTgId) ? true : prev.mibot_enabled,
                mibot_destinatario_ids: nextMibotDests
            };
        });
    };

    const toggleFormMibotDestinatario = (tgId) => {
        setFormData(prev => {
            const exists = prev.mibot_destinatario_ids.includes(tgId);
            const nextIds = exists
                ? prev.mibot_destinatario_ids.filter(x => x !== tgId)
                : [...prev.mibot_destinatario_ids, tgId];
            return {
                ...prev,
                mibot_destinatario_ids: nextIds,
                mibot_enabled: nextIds.length > 0 ? true : prev.mibot_enabled
            };
        });
    };

    // Open Modal Form for Create or Edit
    const handleOpenForm = (task = null) => {
        if (usersList.length === 0) {
            fetchUsers();
        }
        if (mibotRecipients.length === 0) {
            fetchMibotRecipients();
        }
        const today = new Date().toISOString().split('T')[0];
        if (task) {
            const linkedTgId = getLinkedTelegramIdForUser(task.assigned_to);
            const existingDests = (task.mibot_summary?.destinatarios || []).map(d => Number(d.telegram_usuario_id)).filter(Boolean);
            setEditingTask(task);
            setFormData({
                titulo: task.titulo || '',
                descripcion: task.descripcion || '',
                tipo_plazo: task.tipo_plazo || 'dia_especifico',
                fecha_inicio: task.fecha_inicio ? String(task.fecha_inicio).split('T')[0] : '',
                fecha_vencimiento: task.fecha_vencimiento ? String(task.fecha_vencimiento).split('T')[0] : '',
                hora_limite: task.hora_limite ? String(task.hora_limite).substring(0, 5) : '17:00',
                prioridad: task.prioridad || 'media',
                categoria: task.categoria || 'General',
                assigned_to: task.assigned_to || '',
                assigned_to_ids: [],
                checklist: Array.isArray(task.checklist) ? [...task.checklist] : [],
                mibot_enabled: false,
                mibot_tipo: task.mibot_summary?.tipo || 'TAREA',
                mibot_destinatario_ids: existingDests.length > 0 ? existingDests : (linkedTgId ? [linkedTgId] : []),
                mibot_enviar_ahora: true,
                mibot_fecha: task.fecha_vencimiento ? String(task.fecha_vencimiento).split('T')[0] : today,
                mibot_hora: task.hora_limite ? String(task.hora_limite).substring(0, 5) : '08:00',
                mibot_frecuencia: 'UNA_VEZ'
            });
        } else {
            const defaultAssigned = currentUser.id || '';
            const linkedTgId = getLinkedTelegramIdForUser(defaultAssigned);
            setEditingTask(null);
            setFormData({
                titulo: '',
                descripcion: '',
                tipo_plazo: 'dia_especifico',
                fecha_inicio: today,
                fecha_vencimiento: today,
                hora_limite: '17:00',
                prioridad: 'media',
                categoria: 'Operaciones',
                assigned_to: defaultAssigned,
                assigned_to_ids: [],
                checklist: [],
                mibot_enabled: Boolean(linkedTgId),
                mibot_tipo: 'TAREA',
                mibot_destinatario_ids: linkedTgId ? [linkedTgId] : [],
                mibot_enviar_ahora: true,
                mibot_fecha: today,
                mibot_hora: '08:00',
                mibot_frecuencia: 'UNA_VEZ'
            });
        }
        setNewSubtaskText('');
        setShowModalForm(true);
    };

    // Save Form (Create / Edit)
    const handleSubmitForm = async (e) => {
        e.preventDefault();
        if (!formData.titulo.trim()) {
            addToast('El título de la tarea es requerido', 'warning');
            return;
        }
        if (!formData.assigned_to) {
            addToast('Debe asignar la tarea a un colaborador', 'warning');
            return;
        }
        if (!formData.fecha_vencimiento) {
            addToast('Debe indicar la fecha de vencimiento', 'warning');
            return;
        }
        if (formData.mibot_enabled && formData.mibot_destinatario_ids.length === 0) {
            addToast('Selecciona al menos un destinatario de Telegram para MiBot o desmarca la opción de envío por Telegram', 'warning');
            return;
        }

        const allAssignees = editingTask
            ? undefined
            : [...new Set([formData.assigned_to, ...(formData.assigned_to_ids || [])].map(Number).filter(Boolean))];

        const payload = {
            ...formData,
            ...(allAssignees ? { assigned_to_ids: allAssignees } : {}),
            mibot: formData.mibot_enabled ? {
                enabled: true,
                tipo: formData.mibot_tipo || 'TAREA',
                destinatario_ids: formData.mibot_destinatario_ids,
                enviar_ahora: Boolean(formData.mibot_enviar_ahora),
                programado_para: formData.mibot_enviar_ahora
                    ? undefined
                    : `${formData.mibot_fecha || formData.fecha_vencimiento} ${formData.mibot_hora || '08:00'}:00`,
                frecuencia: formData.mibot_frecuencia || 'UNA_VEZ'
            } : null
        };

        try {
            let savedTask = null;
            let savedMibot = null;
            let multiCount = 1;
            let multiAssigneesNames = null;
            if (editingTask) {
                const res = await api.put(`/tasks/${editingTask.id}`, payload);
                savedTask = res.data?.task;
                savedMibot = res.data?.mibot;
                addToast(res.data?.message || 'Tarea actualizada con éxito', 'success');
            } else {
                const res = await api.post('/tasks', payload);
                savedTask = res.data?.task;
                savedMibot = res.data?.mibot;
                multiCount = Number(res.data?.count || 1);
                if (Array.isArray(res.data?.tasks) && res.data.tasks.length > 1) {
                    multiAssigneesNames = res.data.tasks.map(t => t.assigned_user_name).filter(Boolean).join(', ');
                }
                addToast(res.data?.message || 'Tarea asignada y creada con éxito', 'success');
            }
            if (savedTask) {
                setRecentAssignedCard({
                    task: savedTask,
                    mibot: savedMibot,
                    multiCount,
                    multiAssigneesNames,
                    timestamp: new Date().toISOString()
                });
            }
            setShowModalForm(false);
            fetchTasks(true);
            fetchMibotProgramaciones();
        } catch (err) {
            console.error('Error saving task:', err);
            addToast(err.response?.data?.message || 'Error al guardar tarea', 'error');
        }
    };

    // Delete task
    const handleDeleteTask = async (task) => {
        const ok = await confirm(`¿Estás seguro de eliminar la tarea "${task.titulo}"?`, { variant: 'danger' });
        if (!ok) return;

        try {
            await api.delete(`/tasks/${task.id}`);
            addToast('Tarea eliminada con éxito', 'success');
            if (showDetailModal && selectedTask?.id === task.id) {
                setShowDetailModal(false);
            }
            fetchTasks(true);
        } catch (err) {
            console.error(err);
            addToast('Error al eliminar tarea', 'error');
        }
    };

    // Open detail & comments modal
    const handleOpenDetail = async (task) => {
        setSelectedTask(task);
        setShowDetailModal(true);
        setNewCommentText('');
        try {
            const res = await api.get(`/tasks/${task.id}`);
            setSelectedTask(res.data);
            setTaskComments(res.data.comments || []);
        } catch (err) {
            console.error(err);
        }
    };

    // Add comment
    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!newCommentText.trim() || !selectedTask) return;
        setSubmittingComment(true);
        try {
            const res = await api.post(`/tasks/${selectedTask.id}/comments`, { comentario: newCommentText.trim() });
            setTaskComments(prev => [...prev, res.data.comment]);
            setNewCommentText('');
            addToast('Comentario registrado', 'success');
        } catch (err) {
            console.error(err);
            addToast('Error al publicar comentario', 'error');
        } finally {
            setSubmittingComment(false);
        }
    };

    // Add subtask to form
    const handleAddSubtask = () => {
        if (!newSubtaskText.trim()) return;
        const newItem = {
            id: Date.now(),
            texto: newSubtaskText.trim(),
            completado: false
        };
        setFormData(prev => ({
            ...prev,
            checklist: [...prev.checklist, newItem]
        }));
        setNewSubtaskText('');
    };

    const handleRemoveSubtask = (index) => {
        setFormData(prev => ({
            ...prev,
            checklist: prev.checklist.filter((_, i) => i !== index)
        }));
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (!tasks || tasks.length === 0) {
            addToast('No hay tareas para exportar', 'warning');
            return;
        }

        const dataToExport = tasks.map(t => ({
            'ID': t.id,
            'Título': t.titulo,
            'Descripción': t.descripcion || '',
            'Asignado a': t.assigned_user_name || 'N/A',
            'Creado por': t.created_user_name || 'N/A',
            'Prioridad': (t.prioridad || '').toUpperCase(),
            'Estado': (t.estado || '').toUpperCase(),
            'Categoría': t.categoria || 'General',
            'Tipo Plazo': t.tipo_plazo === 'dia_especifico' ? 'Día Específico' : 'Rango de Fechas',
            'Fecha Inicio': t.fecha_inicio ? formatDateSpanish(t.fecha_inicio) : '',
            'Fecha Vencimiento': t.fecha_vencimiento ? formatDateSpanish(t.fecha_vencimiento) : '',
            'Hora Límite': t.hora_limite ? formatTimeSpanish(t.hora_limite) : '',
            'Subtareas Total': (t.checklist || []).length,
            'Subtareas Completadas': (t.checklist || []).filter(c => c.completado).length,
            'Fecha Creación': t.created_at ? formatDateTimeSpanish(t.created_at) : ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Tareas');
        XLSX.writeFile(workbook, `Reporte_Tareas_SIPE_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Reporte Excel descargado con éxito', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                    }}>
                        <ClipboardCheck size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            Gestión y Asignación de Tareas · MiBot Telegram
                        </h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Control de actividades, agendamiento directo con MiBot Telegram (@SIPE_IA_BOT) y seguimiento en tiempo real
                        </p>
                    </div>
                </div>

                {/* Main Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* View mode toggle */}
                    <div style={{
                        display: 'inline-flex',
                        background: 'var(--bg-secondary)',
                        padding: '2px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('kanban')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.3rem 0.65rem',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: viewMode === 'kanban' ? 600 : 400,
                                cursor: 'pointer',
                                background: viewMode === 'kanban' ? 'var(--primary)' : 'transparent',
                                color: viewMode === 'kanban' ? '#ffffff' : 'var(--text-muted)',
                                transition: 'all 0.15s ease'
                            }}
                            title="Ver Tablero Kanban con Arrastrar y Soltar"
                        >
                            <LayoutGrid size={15} />
                            <span>Tablero</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.3rem 0.65rem',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: viewMode === 'table' ? 600 : 400,
                                cursor: 'pointer',
                                background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
                                color: viewMode === 'table' ? '#ffffff' : 'var(--text-muted)',
                                transition: 'all 0.15s ease'
                            }}
                            title="Ver Lista Tabular Compacta"
                        >
                            <List size={15} />
                            <span>Lista</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setViewMode('mibot');
                                fetchMibotProgramaciones();
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.3rem 0.7rem',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: viewMode === 'mibot' ? 700 : 500,
                                cursor: 'pointer',
                                background: viewMode === 'mibot' ? '#0088cc' : 'transparent',
                                color: viewMode === 'mibot' ? '#ffffff' : '#38bdf8',
                                transition: 'all 0.15s ease'
                            }}
                            title="Agenda MiBot Telegram (Avisos, Tareas, Validaciones y Reuniones)"
                        >
                            <Bot size={15} />
                            <span>MiBot Telegram ({mibotProgramaciones.length})</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Exportar a Excel"
                    >
                        <Download size={15} />
                        <span>Excel</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            fetchTasks(false);
                            fetchMibotProgramaciones();
                        }}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Actualizar datos"
                        disabled={refreshing || loadingMibot}
                    >
                        <RefreshCw size={15} className={(refreshing || loadingMibot) ? 'spin' : ''} />
                    </button>

                    <button
                        type="button"
                        onClick={() => handleOpenMibotModal(null, 'TAREA')}
                        className="btn-secondary"
                        style={{
                            height: '36px',
                            padding: '0 0.95rem',
                            fontSize: '0.825rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            borderColor: 'rgba(0, 136, 204, 0.5)',
                            backgroundColor: 'rgba(0, 136, 204, 0.14)',
                            color: '#38bdf8',
                            fontWeight: 600
                        }}
                        title="Agendar Tarea, Validación o Reunión con MiBot de Telegram"
                    >
                        <Bot size={16} />
                        <span>Agendar MiBot</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleOpenForm(null)}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 1.1rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Plus size={16} />
                        <span>Nueva Tarea</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: '0.75rem'
            }}>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', borderLeft: '3px solid var(--primary)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Tareas</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{kpis.total}</span>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', borderLeft: '3px solid #f59e0b' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pendientes</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b' }}>{kpis.pendientes}</span>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', borderLeft: '3px solid #3b82f6' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>En Proceso</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6' }}>{kpis.en_proceso}</span>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', borderLeft: '3px solid #8b5cf6' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>En Revisión</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#8b5cf6' }}>{kpis.en_revision}</span>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', borderLeft: '3px solid #10b981' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completadas</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{kpis.completadas}</span>
                </div>
                <div className="card glass" style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    borderLeft: kpis.vencidas > 0 ? '3px solid #ef4444' : '3px solid var(--border-color)',
                    background: kpis.vencidas > 0 ? 'rgba(239, 68, 68, 0.05)' : undefined
                }}>
                    <span style={{ fontSize: '0.72rem', color: kpis.vencidas > 0 ? '#ef4444' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: kpis.vencidas > 0 ? 600 : 400 }}>
                        {kpis.vencidas > 0 ? '⚠️ Vencidas' : 'Vencidas'}
                    </span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: kpis.vencidas > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                        {kpis.vencidas}
                    </span>
                </div>
                <div
                    className="card glass"
                    onClick={() => setViewMode('mibot')}
                    style={{
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem',
                        borderLeft: '3px solid #0088cc',
                        cursor: 'pointer'
                    }}
                    title="Click para ver Agenda de Avisos, Tareas y Reuniones en MiBot Telegram"
                >
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                        🤖 Agenda MiBot
                    </span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8' }}>
                        {mibotProgramaciones.filter(p => p.estado !== 'CANCELADO').length}
                    </span>
                </div>
            </div>

            {/* TARJETA INFORMATIVA EN SISTEMA: TAREA / ACTIVIDAD RECIÉN ASIGNADA O AGENDADA */}
            {recentAssignedCard && recentAssignedCard.task && (
                <div
                    className="card glass"
                    style={{
                        padding: '0.85rem 1.15rem',
                        borderLeft: '4px solid #10b981',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(56, 189, 248, 0.06) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '0.18rem 0.55rem',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em'
                            }}>
                                ✅ Tarjeta Informativa · Tarea / Actividad Asignada
                            </span>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.14rem 0.45rem',
                                borderRadius: '5px',
                                background: getPriorityBadge(recentAssignedCard.task.prioridad).bg,
                                color: getPriorityBadge(recentAssignedCard.task.prioridad).color,
                                border: `1px solid ${getPriorityBadge(recentAssignedCard.task.prioridad).border}`
                            }}>
                                Prioridad: {getPriorityBadge(recentAssignedCard.task.prioridad).label}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Categoría: <strong style={{ color: 'var(--text-primary)' }}>{recentAssignedCard.task.categoria || 'General'}</strong>
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleOpenDetail(recentAssignedCard.task)}
                                style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Eye size={13} /> Ver Detalle
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleOpenMibotModal(recentAssignedCard.task, 'TAREA')}
                                style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)' }}
                            >
                                <Bot size={13} /> MiBot Telegram
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecentAssignedCard(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
                                title="Cerrar tarjeta informativa"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                #{recentAssignedCard.task.id} · {recentAssignedCard.task.titulo}
                            </div>
                            {recentAssignedCard.task.descripcion && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.18rem', lineHeight: 1.35 }}>
                                    {recentAssignedCard.task.descripcion}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <User size={14} color="var(--primary)" />
                                <span>
                                    Asignado a:{' '}
                                    <strong style={{ color: 'var(--text-primary)' }}>
                                        {recentAssignedCard.multiAssigneesNames
                                            ? `${recentAssignedCard.multiAssigneesNames} (${recentAssignedCard.multiCount} tareas)`
                                            : (recentAssignedCard.task.assigned_user_name || 'Colaborador')}
                                    </strong>
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Calendar size={14} color="#f59e0b" />
                                <span>Plazo: <strong style={{ color: '#fbbf24' }}>{formatDateSpanish(recentAssignedCard.task.fecha_vencimiento)}{recentAssignedCard.task.hora_limite ? ` · ${formatTimeSpanish(recentAssignedCard.task.hora_limite)}` : ''}</strong></span>
                            </div>
                            {(recentAssignedCard.mibot?.programacion || recentAssignedCard.task.mibot_summary?.has_mibot) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontWeight: 600 }}>
                                    <Bot size={14} />
                                    <span>
                                        {recentAssignedCard.mibot?.label ||
                                            (recentAssignedCard.mibot?.dispatch
                                                ? `Telegram MiBot enviado (${recentAssignedCard.mibot.dispatch.sent}/${recentAssignedCard.mibot.dispatch.total})`
                                                : 'Agendado en MiBot Telegram')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TARJETA INFORMATIVA EN SISTEMA: MIS TAREAS Y ACTIVIDADES ASIGNADAS ACTIVAS */}
            {showMyAssignedBanner && myAssignedTasks.length > 0 && (
                <div
                    className="card glass"
                    style={{
                        padding: '0.85rem 1.15rem',
                        borderLeft: '4px solid #38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        background: 'rgba(14, 165, 233, 0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <Bell size={16} color="#38bdf8" />
                            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Mis Tareas y Actividades Asignadas Activas ({myAssignedTasks.length})
                            </span>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                Actividades asignadas a tu usuario pendientes de ejecución o validación
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowMyAssignedBanner(false)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                            <span>Ocultar tarjeta</span>
                            <X size={14} />
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))', gap: '0.6rem' }}>
                        {myAssignedTasks.slice(0, 4).map(t => {
                            const pBadge = getPriorityBadge(t.prioridad);
                            const dBadge = getDeadlineBadge(t);
                            const mBadge = getTaskMibotBadge(t);
                            return (
                                <div
                                    key={t.id}
                                    style={{
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '8px',
                                        background: 'var(--bg-card)',
                                        border: dBadge.isOverdue ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-color)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.38rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: pBadge.bg, color: pBadge.color, border: `1px solid ${pBadge.border}` }}>
                                            {pBadge.label}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            {mBadge && (
                                                <span style={{ fontSize: '0.66rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '4px', background: mBadge.bg, color: mBadge.color, border: `1px solid ${mBadge.border}` }}>
                                                    {mBadge.label}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '4px', background: dBadge.bg, color: dBadge.color, border: `1px solid ${dBadge.border}` }}>
                                                {dBadge.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => handleOpenDetail(t)}
                                        style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.3 }}
                                    >
                                        {t.titulo}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        <span>Por: <strong style={{ color: 'var(--text-secondary)' }}>{t.created_user_name || 'Sistema'}</strong> · {formatDateSpanish(t.fecha_vencimiento)}</span>
                                        <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                                            {t.estado === 'pendiente' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickStatusChange(t.id, 'en_proceso')}
                                                    className="btn-secondary"
                                                    style={{ height: '24px', padding: '0 0.45rem', fontSize: '0.69rem', color: '#38bdf8' }}
                                                    title="Iniciar tarea"
                                                >
                                                    ▶ Iniciar
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleQuickStatusChange(t.id, 'completada')}
                                                className="btn-secondary"
                                                style={{ height: '24px', padding: '0 0.45rem', fontSize: '0.69rem', color: '#10b981' }}
                                                title="Marcar completada"
                                            >
                                                ✔️ Completar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenMibotModal(t, 'TAREA')}
                                                className="btn-secondary"
                                                style={{ height: '24px', padding: '0 0.45rem', fontSize: '0.69rem', color: '#38bdf8' }}
                                                title="Agendar o notificar en MiBot Telegram"
                                            >
                                                🤖
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filter Card */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem' }}>
                    {/* Search Input */}
                    <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por título o descripción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ height: '36px', paddingLeft: '32px', fontSize: '0.825rem' }}
                        />
                    </div>

                    {/* Toggle Mis Tareas */}
                    <button
                        type="button"
                        onClick={() => setSoloMias(prev => !prev)}
                        style={{
                            height: '36px',
                            padding: '0 0.85rem',
                            fontSize: '0.8rem',
                            borderRadius: '6px',
                            border: soloMias ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                            background: soloMias ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-secondary)',
                            color: soloMias ? 'var(--primary)' : 'var(--text-secondary)',
                            fontWeight: soloMias ? 600 : 400,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                        }}
                    >
                        <User size={14} />
                        <span>{soloMias ? 'Mis Tareas (Asignadas / Creadas)' : 'Todas las Tareas'}</span>
                    </button>

                    {/* Filter User */}
                    {!soloMias && (
                        <select
                            className="form-control"
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            style={{ height: '36px', width: '200px', fontSize: '0.825rem' }}
                        >
                            <option value="">-- Todos los colaboradores --</option>
                            {usersList.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.nombre || u.username} {u.role_name ? `(${u.role_name})` : ''}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Filter Priority */}
                    <select
                        className="form-control"
                        value={filterPrioridad}
                        onChange={(e) => setFilterPrioridad(e.target.value)}
                        style={{ height: '36px', width: '135px', fontSize: '0.825rem' }}
                    >
                        <option value="todas">Prioridad: Todas</option>
                        <option value="urgente">Urgente</option>
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                    </select>

                    {/* Filter Category */}
                    <select
                        className="form-control"
                        value={filterCategoria}
                        onChange={(e) => setFilterCategoria(e.target.value)}
                        style={{ height: '36px', width: '145px', fontSize: '0.825rem' }}
                    >
                        <option value="todas">Categoría: Todas</option>
                        {CATEGORIAS.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* View Mode: Tablero Kanban vs Vista Lista */}
            {loading ? (
                <div className="card glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto' }} />
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Cargando actividades y tareas...</p>
                </div>
            ) : viewMode === 'kanban' ? (
                /* TABLERO KANBAN */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '1rem',
                    alignItems: 'start'
                }}>
                    {COLUMNS.map(col => {
                        const colTasks = tasks.filter(t => t.estado === col.id);
                        const isOver = dragOverColumn === col.id;

                        return (
                            <div
                                key={col.id}
                                onDragOver={(e) => handleDragOver(e, col.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, col.id)}
                                style={{
                                    background: isOver ? col.bgLight : 'var(--bg-card)',
                                    borderRadius: '12px',
                                    border: isOver ? `2px dashed ${col.color}` : '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: '420px',
                                    transition: 'all 0.2s ease',
                                    boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.04))'
                                }}
                            >
                                {/* Column Header */}
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--bg-secondary)',
                                    borderTopLeftRadius: '11px',
                                    borderTopRightRadius: '11px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {col.title}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        padding: '0.15rem 0.5rem',
                                        borderRadius: '10px',
                                        background: col.bgLight,
                                        color: col.color,
                                        border: `1px solid ${col.border}`
                                    }}>
                                        {colTasks.length}
                                    </span>
                                </div>

                                {/* Task Cards Container */}
                                <div style={{
                                    padding: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.65rem',
                                    flex: 1
                                }}>
                                    {colTasks.length === 0 ? (
                                        <div style={{
                                            padding: '2rem 1rem',
                                            textAlign: 'center',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.78rem',
                                            border: '1px dashed var(--border-color)',
                                            borderRadius: '8px'
                                        }}>
                                            {isOver ? 'Soltar aquí para mover' : 'No hay tareas en esta columna'}
                                        </div>
                                    ) : (
                                        colTasks.map(task => {
                                            const pBadge = getPriorityBadge(task.prioridad);
                                            const dBadge = getDeadlineBadge(task);
                                            const checklist = Array.isArray(task.checklist) ? task.checklist : [];
                                            const completedCount = checklist.filter(c => c.completado).length;
                                            const percent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;
                                            const isBeingDragged = String(task.id) === String(draggedTaskId);

                                            return (
                                                <div
                                                    key={task.id}
                                                    draggable={true}
                                                    onDragStart={(e) => handleDragStart(e, task.id)}
                                                    style={{
                                                        background: 'var(--bg-primary)',
                                                        borderRadius: '8px',
                                                        border: dBadge.isOverdue ? '1px solid #ef4444' : '1px solid var(--border-color)',
                                                        padding: '0.75rem',
                                                        cursor: 'grab',
                                                        opacity: isBeingDragged ? 0.4 : 1,
                                                        boxShadow: isBeingDragged ? '0 10px 20px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem'
                                                    }}
                                                    className="task-kanban-card"
                                                >
                                                    {/* Card Top: Category & Priority */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            color: 'var(--text-muted)',
                                                            fontWeight: 600,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem'
                                                        }}>
                                                            <Tag size={11} />
                                                            {task.categoria || 'General'}
                                                        </span>

                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            padding: '0.12rem 0.4rem',
                                                            borderRadius: '4px',
                                                            background: pBadge.bg,
                                                            color: pBadge.color,
                                                            border: `1px solid ${pBadge.border}`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.2rem'
                                                        }}>
                                                            {pBadge.isUrgent && <Flame size={11} />}
                                                            {pBadge.label}
                                                        </span>
                                                    </div>

                                                    {/* Card Title */}
                                                    <div
                                                        onClick={() => handleOpenDetail(task)}
                                                        style={{
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600,
                                                            color: 'var(--text-primary)',
                                                            cursor: 'pointer',
                                                            lineHeight: '1.3'
                                                        }}
                                                        title="Click para ver detalle"
                                                    >
                                                        {task.titulo}
                                                    </div>

                                                    {/* Description Snippet */}
                                                    {task.descripcion && (
                                                        <p style={{
                                                            fontSize: '0.75rem',
                                                            color: 'var(--text-muted)',
                                                            margin: 0,
                                                            lineHeight: '1.3',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden'
                                                        }}>
                                                            {task.descripcion}
                                                        </p>
                                                    )}

                                                    {/* Subtasks Progress */}
                                                    {checklist.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                                <span>Sub-tareas</span>
                                                                <span>{completedCount}/{checklist.length} ({percent}%)</span>
                                                            </div>
                                                            <div style={{ height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${percent}%`, background: percent === 100 ? '#10b981' : 'var(--primary)', transition: 'width 0.3s ease' }} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Deadline Badge */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem', paddingTop: '0.25rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            <Calendar size={13} />
                                                            <span>
                                                                {task.tipo_plazo === 'rango' && task.fecha_inicio
                                                                    ? `${formatDateSpanish(task.fecha_inicio)} - ${formatDateSpanish(task.fecha_vencimiento)}`
                                                                    : formatDateSpanish(task.fecha_vencimiento)}
                                                                {task.hora_limite ? ` • ${formatTimeSpanish(task.hora_limite)}` : ''}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                            {getTaskMibotBadge(task) && (
                                                                <span
                                                                    onClick={() => handleOpenMibotModal(task, 'TAREA')}
                                                                    style={{
                                                                        fontSize: '0.66rem',
                                                                        fontWeight: 600,
                                                                        padding: '0.1rem 0.38rem',
                                                                        borderRadius: '4px',
                                                                        background: getTaskMibotBadge(task).bg,
                                                                        color: getTaskMibotBadge(task).color,
                                                                        border: `1px solid ${getTaskMibotBadge(task).border}`,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    title="Click para gestionar aviso en MiBot Telegram"
                                                                >
                                                                    {getTaskMibotBadge(task).label}
                                                                </span>
                                                            )}
                                                            <span style={{
                                                                fontSize: '0.68rem',
                                                                fontWeight: 600,
                                                                padding: '0.12rem 0.4rem',
                                                                borderRadius: '4px',
                                                                background: dBadge.bg,
                                                                color: dBadge.color,
                                                                border: `1px solid ${dBadge.border}`
                                                            }}>
                                                                {dBadge.label}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Card Bottom: User, Comments & Quick Actions */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        borderTop: '1px solid var(--border-color)',
                                                        paddingTop: '0.45rem',
                                                        marginTop: '0.25rem'
                                                    }}>
                                                        {/* Assigned user avatar/badge */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} title={`Asignado a: ${task.assigned_user_name || 'Sin asignar'}`}>
                                                            <div style={{
                                                                width: '22px',
                                                                height: '22px',
                                                                borderRadius: '50%',
                                                                background: 'rgba(37, 99, 235, 0.15)',
                                                                color: 'var(--primary)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 700
                                                            }}>
                                                                {(task.assigned_user_name || 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {task.assigned_user_name || 'Usuario'}
                                                            </span>
                                                        </div>

                                                        {/* Quick action buttons */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            {task.comments_count > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenDetail(task)}
                                                                    style={{ background: 'none', border: 'none', padding: '3px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem' }}
                                                                    title={`${task.comments_count} comentarios`}
                                                                >
                                                                    <MessageSquare size={13} />
                                                                    <span>{task.comments_count}</span>
                                                                </button>
                                                            )}

                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenMibotModal(task, 'TAREA')}
                                                                style={{ background: 'none', border: 'none', padding: '3px', cursor: 'pointer', color: '#38bdf8' }}
                                                                title="Agendar / Enviar por MiBot Telegram"
                                                            >
                                                                <Bot size={14} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenDetail(task)}
                                                                style={{ background: 'none', border: 'none', padding: '3px', cursor: 'pointer', color: 'var(--text-muted)' }}
                                                                title="Ver detalle"
                                                            >
                                                                <Eye size={14} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenForm(task)}
                                                                style={{ background: 'none', border: 'none', padding: '3px', cursor: 'pointer', color: 'var(--text-muted)' }}
                                                                title="Editar tarea"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteTask(task)}
                                                                style={{ background: 'none', border: 'none', padding: '3px', cursor: 'pointer', color: '#ef4444' }}
                                                                title="Eliminar tarea"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : viewMode === 'table' ? (
                /* TABLA LISTA COMPACTA */
                <div className="card glass table-responsive">
                    <table className="table" style={{ width: '100%', minWidth: '1020px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Título</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Asignado A</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Prioridad</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Estado</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Plazo / Vencimiento</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>MiBot Telegram</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Categoría</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Subtareas</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        No se encontraron tareas con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                tasks.map((task, idx) => {
                                    const pBadge = getPriorityBadge(task.prioridad);
                                    const dBadge = getDeadlineBadge(task);
                                    const mBadge = getTaskMibotBadge(task);
                                    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
                                    const completedCount = checklist.filter(c => c.completado).length;

                                    return (
                                        <tr
                                            key={task.id}
                                            style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                                            }}
                                        >
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span onClick={() => handleOpenDetail(task)} style={{ cursor: 'pointer', color: 'var(--primary)' }}>
                                                        {task.titulo}
                                                    </span>
                                                    {task.descripcion && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {task.descripcion}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <User size={13} style={{ color: 'var(--primary)' }} />
                                                    <span>{task.assigned_user_name || 'Sin asignar'}</span>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    padding: '0.12rem 0.4rem',
                                                    borderRadius: '4px',
                                                    background: pBadge.bg,
                                                    color: pBadge.color,
                                                    border: `1px solid ${pBadge.border}`
                                                }}>
                                                    {pBadge.label}
                                                </span>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                                <select
                                                    value={task.estado}
                                                    onChange={(e) => handleQuickStatusChange(task.id, e.target.value)}
                                                    style={{
                                                        height: '32px',
                                                        padding: '0 1.6rem 0 0.5rem',
                                                        fontSize: '0.76rem',
                                                        width: '130px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        backgroundColor: 'var(--bg-card)',
                                                        color: 'var(--text-primary)',
                                                        boxSizing: 'border-box',
                                                        cursor: 'pointer',
                                                        lineHeight: '32px'
                                                    }}
                                                >
                                                    <option value="pendiente">Pendiente</option>
                                                    <option value="en_proceso">En Proceso</option>
                                                    <option value="en_revision">En Revisión</option>
                                                    <option value="completada">Completada</option>
                                                    <option value="cancelada">Cancelada</option>
                                                </select>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                                                        {task.tipo_plazo === 'rango' && task.fecha_inicio
                                                            ? `${formatDateSpanish(task.fecha_inicio)} - ${formatDateSpanish(task.fecha_vencimiento)}`
                                                            : formatDateSpanish(task.fecha_vencimiento)}
                                                        {task.hora_limite ? ` • ${formatTimeSpanish(task.hora_limite)}` : ''}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 600,
                                                        padding: '0.1rem 0.35rem',
                                                        borderRadius: '4px',
                                                        background: dBadge.bg,
                                                        color: dBadge.color,
                                                        border: `1px solid ${dBadge.border}`,
                                                        display: 'inline-block',
                                                        width: 'fit-content'
                                                    }}>
                                                        {dBadge.label}
                                                    </span>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem' }}>
                                                {mBadge ? (
                                                    <span
                                                        onClick={() => handleOpenMibotModal(task, 'TAREA')}
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            padding: '0.14rem 0.45rem',
                                                            borderRadius: '5px',
                                                            background: mBadge.bg,
                                                            color: mBadge.color,
                                                            border: `1px solid ${mBadge.border}`,
                                                            cursor: 'pointer',
                                                            display: 'inline-block'
                                                        }}
                                                    >
                                                        {mBadge.label}
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenMibotModal(task, 'TAREA')}
                                                        className="btn-secondary"
                                                        style={{ height: '25px', padding: '0 0.5rem', fontSize: '0.7rem', color: '#38bdf8' }}
                                                    >
                                                        🤖 Agendar
                                                    </button>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {task.categoria || 'General'}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem', textAlign: 'center' }}>
                                                {checklist.length > 0 ? (
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.1rem 0.4rem',
                                                        borderRadius: '10px',
                                                        background: completedCount === checklist.length ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-secondary)',
                                                        color: completedCount === checklist.length ? '#10b981' : 'var(--text-secondary)',
                                                        fontWeight: 600
                                                    }}>
                                                        {completedCount} / {checklist.length}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenMibotModal(task, 'TAREA')}
                                                        className="btn-secondary"
                                                        style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem', color: '#38bdf8' }}
                                                        title="Agendar / Enviar por MiBot Telegram"
                                                    >
                                                        <Bot size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDetail(task)}
                                                        className="btn-secondary"
                                                        style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem' }}
                                                        title="Ver detalle"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenForm(task)}
                                                        className="btn-secondary"
                                                        style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem' }}
                                                        title="Editar tarea"
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteTask(task)}
                                                        className="btn-secondary"
                                                        style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem', color: '#ef4444' }}
                                                        title="Eliminar tarea"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* VISTA INMERSA: MIBOT TELEGRAM (AVISOS, TAREAS, VALIDACIONES Y REUNIONES) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
                    <div className="card glass" style={{ padding: '0.85rem 1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            {[
                                { id: 'ALL', label: 'Todos' },
                                ...MIBOT_TIPO_OPTIONS.map(t => ({ id: t.id, label: `${t.emoji} ${t.short}` }))
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setMibotTipoFilter(opt.id)}
                                    style={{
                                        height: '32px',
                                        padding: '0 0.75rem',
                                        borderRadius: '16px',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        border: mibotTipoFilter === opt.id ? '1px solid #0088cc' : '1px solid var(--border-color)',
                                        backgroundColor: mibotTipoFilter === opt.id ? 'rgba(0, 136, 204, 0.2)' : 'transparent',
                                        color: mibotTipoFilter === opt.id ? '#38bdf8' : 'var(--text-muted)'
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}

                            <select
                                className="form-control"
                                value={mibotEstadoFilter}
                                onChange={e => setMibotEstadoFilter(e.target.value)}
                                style={{ height: '32px', fontSize: '0.78rem', width: '145px', padding: '0 0.5rem' }}
                            >
                                <option value="ALL">Estado: Todos</option>
                                <option value="PROGRAMADO">Programados</option>
                                <option value="ENVIADO">Enviados</option>
                                <option value="COMPLETADO">Completados</option>
                                <option value="CANCELADO">Cancelados</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={fetchMibotProgramaciones}
                                disabled={loadingMibot}
                                style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RefreshCw size={13} className={loadingMibot ? 'spin' : ''} /> Actualizar
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => handleOpenMibotModal(null, 'TAREA')}
                                style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Plus size={15} /> + Agendar Tarea / Actividad / Reunión en MiBot
                            </button>
                        </div>
                    </div>

                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '940px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '135px' }}>Tipo</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Asunto, Mensaje y Tarea Vinculada</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '310px' }}>Destinatarios Personales (Confirmación Telegram)</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '155px' }}>Programación</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '105px' }}>Estado</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '115px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingMibot ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            Cargando programaciones de MiBot Telegram...
                                        </td>
                                    </tr>
                                ) : mibotProgramaciones.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No hay tareas, actividades ni reuniones agendadas en MiBot con los filtros actuales. Usa <strong>&quot;+ Agendar Tarea / Actividad / Reunión en MiBot&quot;</strong> para comenzar.
                                        </td>
                                    </tr>
                                ) : (
                                    mibotProgramaciones.map(p => {
                                        const tipoMeta = MIBOT_TIPO_OPTIONS.find(t => t.id === p.tipo) || MIBOT_TIPO_OPTIONS[1];
                                        return (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', verticalAlign: 'top' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        padding: '0.16rem 0.45rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        backgroundColor: tipoMeta.bg,
                                                        color: tipoMeta.color
                                                    }}>
                                                        {tipoMeta.emoji} {tipoMeta.short}
                                                    </span>
                                                    {p.task_id && (
                                                        <div style={{ fontSize: '0.68rem', color: '#38bdf8', marginTop: '0.2rem', fontWeight: 600 }}>
                                                            📋 Tarea #{p.task_id}
                                                        </div>
                                                    )}
                                                    {p.vencimiento_id && (
                                                        <div style={{ fontSize: '0.67rem', color: '#fbbf24', marginTop: '0.2rem', fontWeight: 600 }}>
                                                            💳 Pago #{p.recordatorio_id || p.vencimiento_id}
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.titulo}</div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                                                        {p.mensaje}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem' }}>
                                                        {(p.destinatarios || []).map(d => {
                                                            const st = getDeliveryBadgeStyle(d.estado_entrega);
                                                            return (
                                                                <span
                                                                    key={d.id}
                                                                    title={d.respuesta_nota || d.error_msg || `${d.nombre_destinatario}: ${d.estado_entrega}`}
                                                                    style={{
                                                                        fontSize: '0.7rem',
                                                                        padding: '0.12rem 0.45rem',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: st.bg,
                                                                        color: st.color,
                                                                        border: st.border,
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    {d.nombre_destinatario}{d.cargo ? ` (${d.cargo})` : ''} · {st.label}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', verticalAlign: 'top' }}>
                                                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                                        {formatMibotDateTime(p.proximo_envio_at || p.programado_para)}
                                                    </div>
                                                    <div style={{ fontSize: '0.69rem', marginTop: '0.12rem' }}>
                                                        {p.frecuencia === 'DIARIO_HASTA_PAGAR' ? '🔁 Diario hasta pagar' : p.frecuencia === 'DIARIO' ? '🔁 Diario' : p.frecuencia === 'SEMANAL' ? '🔁 Semanal' : '1 vez'}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', verticalAlign: 'top' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        padding: '0.16rem 0.5rem',
                                                        borderRadius: '10px',
                                                        backgroundColor: p.estado === 'PROGRAMADO' ? 'rgba(56, 189, 248, 0.16)' : p.estado === 'COMPLETADO' ? 'rgba(16, 185, 129, 0.16)' : p.estado === 'CANCELADO' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(99, 102, 241, 0.16)',
                                                        color: p.estado === 'PROGRAMADO' ? '#38bdf8' : p.estado === 'COMPLETADO' ? '#34d399' : p.estado === 'CANCELADO' ? '#f87171' : '#a5b4fc'
                                                    }}>
                                                        {p.estado}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.28rem', alignItems: 'center' }}>
                                                        {p.estado !== 'CANCELADO' && (
                                                            <button
                                                                type="button"
                                                                className="btn-secondary"
                                                                disabled={sendingMibotId === p.id}
                                                                onClick={() => handleSendMibotNow(p)}
                                                                title="Enviar mensaje personal ahora mismo en Telegram"
                                                                style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.7rem' }}
                                                            >
                                                                <Send size={12} color="#0088cc" />
                                                            </button>
                                                        )}
                                                        {p.estado === 'PROGRAMADO' && (
                                                            <button
                                                                type="button"
                                                                className="btn-secondary"
                                                                onClick={() => handleChangeMibotEstado(p, 'CANCELADO')}
                                                                title="Cancelar programación"
                                                                style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.7rem' }}
                                                            >
                                                                <XCircle size={12} color="#f59e0b" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="btn-secondary"
                                                            onClick={() => handleDeleteMibotProg(p)}
                                                            title="Eliminar programación"
                                                            style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.7rem' }}
                                                        >
                                                            <Trash2 size={12} color="#ef4444" />
                                                        </button>
                                                    </div>
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

            {/* MODAL CREAR / EDITAR TAREA */}
            <Modal
                open={showModalForm}
                isOpen={showModalForm}
                onClose={() => setShowModalForm(false)}
                title={editingTask ? 'Editar Tarea' : 'Nueva Asignación de Tarea'}
                size="lg"
            >
                <form onSubmit={handleSubmitForm} className="form-grid form-grid-2">
                    {/* Título */}
                    <div className="span-2">
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Título de la Tarea *
                        </label>
                        <input
                            type="text"
                            required
                            className="form-control"
                            placeholder="Ej. VERIFICACIÓN MENSUAL DE EXTINTORES"
                            value={formData.titulo}
                            onChange={(e) => setFormData({ ...formData, titulo: e.target.value.toUpperCase() })}
                            style={{ textTransform: 'uppercase', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>

                    {/* Asignado A */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Asignar a Colaborador *
                            </label>
                            <button
                                type="button"
                                onClick={() => fetchUsers()}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--primary)',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0 0.2rem'
                                }}
                                title="Recargar colaboradores"
                            >
                                <RefreshCw size={11} className={usersLoading ? 'spin' : ''} />
                                Recargar
                            </button>
                        </div>
                        <select
                            required
                            className="form-control"
                            value={formData.assigned_to}
                            onChange={(e) => handleAssignedUserChange(e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="">-- Seleccionar colaborador --</option>
                            {usersLoading && usersList.length === 0 ? (
                                <option value="" disabled>Cargando colaboradores...</option>
                            ) : usersList.length === 0 ? (
                                <option value="" disabled>No se encontraron colaboradores</option>
                            ) : (
                                usersList.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre || u.username} {u.role_name ? `(${u.role_name})` : ''}{u.telegram_usuario_id ? ' · 🤖 Telegram' : ''}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Asignación Multi-Usuario Adicional (solo en creación) */}
                    {!editingTask && usersList.length > 1 && (
                        <div className="span-2" style={{
                            padding: '0.55rem 0.75rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Users size={13} color="var(--primary)" />
                                    Asignar también a más colaboradores (opcional)
                                </span>
                                {(formData.assigned_to_ids || []).length > 0 && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8' }}>
                                        +{(formData.assigned_to_ids || []).length} adicional(es)
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.38rem', maxHeight: '105px', overflowY: 'auto' }}>
                                {usersList
                                    .filter(u => Number(u.id) !== Number(formData.assigned_to))
                                    .map(u => {
                                        const isExtraSelected = (formData.assigned_to_ids || []).map(Number).includes(Number(u.id));
                                        return (
                                            <label
                                                key={u.id}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.35rem',
                                                    padding: '0.24rem 0.5rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.74rem',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                    border: isExtraSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                                                    background: isExtraSelected ? 'rgba(59, 130, 246, 0.14)' : 'var(--bg-card)',
                                                    color: isExtraSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    fontWeight: isExtraSelected ? 600 : 400
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isExtraSelected}
                                                    onChange={() => toggleExtraAssignedUser(u.id)}
                                                    style={{ width: '14px', height: '14px' }}
                                                />
                                                <span>{u.nombre || u.username}{u.telegram_usuario_id ? ' 🤖' : ''}</span>
                                            </label>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {/* Categoría */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Categoría *
                        </label>
                        <select
                            className="form-control"
                            value={formData.categoria}
                            onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            {CATEGORIAS.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tipo de Plazo */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Modalidad de Plazo *
                        </label>
                        <select
                            className="form-control"
                            value={formData.tipo_plazo}
                            onChange={(e) => setFormData({ ...formData, tipo_plazo: e.target.value })}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="dia_especifico">Día Específico (Fecha fija)</option>
                            <option value="rango">Rango de Fechas (Plazo)</option>
                        </select>
                    </div>

                    {/* Prioridad */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Prioridad *
                        </label>
                        <select
                            className="form-control"
                            value={formData.prioridad}
                            onChange={(e) => setFormData({ ...formData, prioridad: e.target.value })}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="baja">Baja</option>
                            <option value="media">Media</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente 🔥</option>
                        </select>
                    </div>

                    {/* Fechas según tipo de plazo */}
                    {formData.tipo_plazo === 'rango' ? (
                        <>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Fecha Inicio *
                                </label>
                                <input
                                    type="date"
                                    required
                                    className="form-control"
                                    value={formData.fecha_inicio}
                                    onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Fecha Vencimiento *
                                </label>
                                <input
                                    type="date"
                                    required
                                    className="form-control"
                                    value={formData.fecha_vencimiento}
                                    onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Fecha Límite / Realización *
                                </label>
                                <input
                                    type="date"
                                    required
                                    className="form-control"
                                    value={formData.fecha_vencimiento}
                                    onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Hora Límite (Opcional)
                                </label>
                                <input
                                    type="time"
                                    className="form-control"
                                    value={formData.hora_limite}
                                    onChange={(e) => setFormData({ ...formData, hora_limite: e.target.value })}
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                        </>
                    )}

                    {/* Descripción */}
                    <div className="span-2">
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Instrucciones o Descripción
                        </label>
                        <textarea
                            rows={3}
                            className="form-control"
                            placeholder="Detalla las instrucciones, requerimientos o contexto de la tarea..."
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            style={{ fontSize: '0.825rem' }}
                        />
                    </div>

                    {/* Dynamic Subtasks / Checklist Creator */}
                    <div className="span-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                            Lista de Verificación / Sub-tareas (Opcional)
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Escribe un ítem de verificación (ej. Revisar precintos de seguridad)..."
                                value={newSubtaskText}
                                onChange={(e) => setNewSubtaskText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                                style={{ height: '36px', fontSize: '0.825rem' }}
                            />
                            <button
                                type="button"
                                onClick={handleAddSubtask}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            >
                                + Agregar Ítem
                            </button>
                        </div>

                        {formData.checklist.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto', padding: '0.35rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                {formData.checklist.map((item, idx) => (
                                    <div key={item.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                                            • {item.texto}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveSubtask(idx)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                            title="Eliminar ítem"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* MIBOT TELEGRAM IMMERSED SCHEDULING & NOTIFICATION SECTION */}
                    <div
                        className="span-2"
                        style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '9px',
                            border: formData.mibot_enabled ? '1px solid rgba(0, 136, 204, 0.45)' : '1px solid var(--border-color)',
                            background: formData.mibot_enabled ? 'rgba(0, 136, 204, 0.08)' : 'var(--bg-secondary)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.6rem'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(formData.mibot_enabled)}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        const linkedTgId = getLinkedTelegramIdForUser(formData.assigned_to);
                                        setFormData(prev => ({
                                            ...prev,
                                            mibot_enabled: checked,
                                            mibot_destinatario_ids: checked && prev.mibot_destinatario_ids.length === 0 && linkedTgId
                                                ? [linkedTgId]
                                                : prev.mibot_destinatario_ids
                                        }));
                                    }}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <Bot size={16} color="#38bdf8" />
                                <span>Agendar y notificar por MiBot de Telegram (@SIPE_IA_BOT)</span>
                            </label>
                            {formData.mibot_enabled && (
                                <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>
                                    {formData.mibot_destinatario_ids.length} destinatario(s) en Telegram
                                </span>
                            )}
                        </div>

                        {formData.mibot_enabled && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                {/* Selección de Destinatarios de Telegram */}
                                <div>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                                        Destinatarios en Telegram (Confirmación personal Visto / Validado):
                                    </span>
                                    {mibotRecipients.length === 0 ? (
                                        <div style={{ fontSize: '0.74rem', color: '#fbbf24' }}>
                                            No hay usuarios activos de Telegram con MiBot habilitado.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '115px', overflowY: 'auto' }}>
                                            {mibotRecipients.map(r => {
                                                const isSel = formData.mibot_destinatario_ids.includes(r.id);
                                                return (
                                                    <label
                                                        key={r.id}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.35rem',
                                                            padding: '0.28rem 0.55rem',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                            border: isSel ? '1px solid #0088cc' : '1px solid var(--border-color)',
                                                            background: isSel ? 'rgba(0, 136, 204, 0.18)' : 'var(--bg-card)',
                                                            color: isSel ? '#38bdf8' : 'var(--text-secondary)',
                                                            fontWeight: isSel ? 700 : 500
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSel}
                                                            onChange={() => toggleFormMibotDestinatario(r.id)}
                                                            style={{ width: '14px', height: '14px' }}
                                                        />
                                                        <span>{r.nombre_completo}{r.cargo ? ` (${r.cargo})` : ''}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Configuración de Tipo, Momento de Envío y Frecuencia */}
                                <div className="form-grid form-grid-3" style={{ gap: '0.55rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                                            Tipo en MiBot
                                        </label>
                                        <select
                                            className="form-control"
                                            value={formData.mibot_tipo}
                                            onChange={e => setFormData({ ...formData, mibot_tipo: e.target.value })}
                                            style={{ height: '34px', fontSize: '0.78rem' }}
                                        >
                                            <option value="TAREA">📋 Tarea Asignada</option>
                                            <option value="VALIDACION">✅ Validar Actividad</option>
                                            <option value="REUNION">📅 Reunión</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                                            Momento de Envío
                                        </label>
                                        <select
                                            className="form-control"
                                            value={formData.mibot_enviar_ahora ? 'NOW' : 'SCHEDULE'}
                                            onChange={e => setFormData({ ...formData, mibot_enviar_ahora: e.target.value === 'NOW' })}
                                            style={{ height: '34px', fontSize: '0.78rem' }}
                                        >
                                            <option value="NOW">⚡ Enviar ahora mismo al guardar</option>
                                            <option value="SCHEDULE">🗓️ Agendar fecha y hora</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                                            Frecuencia Recordatorio
                                        </label>
                                        <select
                                            className="form-control"
                                            value={formData.mibot_frecuencia}
                                            onChange={e => setFormData({ ...formData, mibot_frecuencia: e.target.value })}
                                            style={{ height: '34px', fontSize: '0.78rem' }}
                                        >
                                            <option value="UNA_VEZ">Una sola vez</option>
                                            <option value="DIARIO">Todos los días</option>
                                            <option value="SEMANAL">Cada semana</option>
                                        </select>
                                    </div>
                                </div>

                                {!formData.mibot_enviar_ahora && (
                                    <div className="form-grid form-grid-2" style={{ gap: '0.55rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                                                Fecha Programada (Telegram)
                                            </label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={formData.mibot_fecha}
                                                onChange={e => setFormData({ ...formData, mibot_fecha: e.target.value })}
                                                style={{ height: '34px', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                                                Hora Programada (El Salvador)
                                            </label>
                                            <input
                                                type="time"
                                                className="form-control"
                                                value={formData.mibot_hora}
                                                onChange={e => setFormData({ ...formData, mibot_hora: e.target.value })}
                                                style={{ height: '34px', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="span-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setShowModalForm(false)}
                            style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            {formData.mibot_enabled && <Bot size={15} />}
                            <span>
                                {editingTask
                                    ? (formData.mibot_enabled ? 'Guardar y Notificar en MiBot' : 'Guardar Cambios')
                                    : (formData.mibot_enabled ? 'Asignar Tarea y Enviar MiBot' : 'Asignar Tarea')}
                            </span>
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL DETALLE DE TAREA Y BITÁCORA DE COMENTARIOS */}
            {selectedTask && (
                <Modal
                    open={showDetailModal}
                    isOpen={showDetailModal}
                    onClose={() => setShowDetailModal(false)}
                    title={`Detalle de Tarea #${selectedTask.id}`}
                    size="md"
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Task Title & State Toolbar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                    {selectedTask.titulo}
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '6px',
                                    background: getPriorityBadge(selectedTask.prioridad).bg,
                                    color: getPriorityBadge(selectedTask.prioridad).color,
                                    border: `1px solid ${getPriorityBadge(selectedTask.prioridad).border}`
                                }}>
                                    {getPriorityBadge(selectedTask.prioridad).label}
                                </span>
                            </div>

                            {/* Status Quick Select */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Estado actual:</span>
                                    <select
                                        value={selectedTask.estado}
                                        onChange={(e) => handleQuickStatusChange(selectedTask.id, e.target.value)}
                                        style={{
                                            height: '34px',
                                            padding: '0 2rem 0 0.75rem',
                                            fontSize: '0.825rem',
                                            fontWeight: 600,
                                            width: '160px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-color)',
                                            backgroundColor: 'var(--bg-card)',
                                            color: 'var(--text-primary)',
                                            boxSizing: 'border-box',
                                            cursor: 'pointer',
                                            lineHeight: '34px'
                                        }}
                                    >
                                        <option value="pendiente">🟡 Pendiente</option>
                                        <option value="en_proceso">🔵 En Proceso</option>
                                        <option value="en_revision">🟣 En Revisión</option>
                                        <option value="completada">🟢 Completada</option>
                                        <option value="cancelada">⚪ Cancelada</option>
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleOpenMibotModal(selectedTask, 'TAREA')}
                                    style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                                >
                                    <Bot size={14} />
                                    <span>Agendar / Notificar MiBot</span>
                                </button>
                            </div>
                        </div>

                        {/* Meta info grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '0.65rem',
                            padding: '0.65rem 0.85rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                            fontSize: '0.78rem'
                        }}>
                            <div>
                                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Asignado a:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{selectedTask.assigned_user_name || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Categoría:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{selectedTask.categoria || 'General'}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Plazo / Vencimiento:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>
                                    {selectedTask.tipo_plazo === 'rango' && selectedTask.fecha_inicio
                                        ? `${formatDateSpanish(selectedTask.fecha_inicio)} al ${formatDateSpanish(selectedTask.fecha_vencimiento)}`
                                        : formatDateSpanish(selectedTask.fecha_vencimiento)}
                                    {selectedTask.hora_limite ? ` • ${formatTimeSpanish(selectedTask.hora_limite)}` : ''}
                                </strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Estado Plazo:</span>
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px',
                                    background: getDeadlineBadge(selectedTask).bg,
                                    color: getDeadlineBadge(selectedTask).color,
                                    border: `1px solid ${getDeadlineBadge(selectedTask).border}`
                                }}>
                                    {getDeadlineBadge(selectedTask).label}
                                </span>
                            </div>
                        </div>

                        {/* Seguimiento en Telegram (MiBot) */}
                        {selectedTask.mibot_summary?.has_mibot && (
                            <div style={{
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                background: 'rgba(0, 136, 204, 0.08)',
                                border: '1px solid rgba(0, 136, 204, 0.3)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.4rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Bot size={14} /> Seguimiento Personal en MiBot Telegram
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        Estado: <strong style={{ color: 'var(--text-primary)' }}>{selectedTask.mibot_summary.ultimo_estado}</strong>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {(selectedTask.mibot_summary.destinatarios || []).map(d => {
                                        const st = getDeliveryBadgeStyle(d.estado_entrega);
                                        return (
                                            <span
                                                key={d.id}
                                                style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.12rem 0.45rem',
                                                    borderRadius: '6px',
                                                    backgroundColor: st.bg,
                                                    color: st.color,
                                                    border: st.border,
                                                    fontWeight: 600
                                                }}
                                            >
                                                {d.nombre_destinatario}{d.cargo ? ` (${d.cargo})` : ''} · {st.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        {selectedTask.descripcion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Instrucciones:</span>
                                <div style={{
                                    padding: '0.65rem 0.85rem',
                                    background: 'var(--bg-card)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    fontSize: '0.8rem',
                                    lineHeight: '1.4',
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'pre-line'
                                }}>
                                    {selectedTask.descripcion}
                                </div>
                            </div>
                        )}

                        {/* Interactive Checklist */}
                        {Array.isArray(selectedTask.checklist) && selectedTask.checklist.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Sub-tareas y Verificaciones:
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        {selectedTask.checklist.filter(c => c.completado).length} de {selectedTask.checklist.length} completadas
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {selectedTask.checklist.map((item, idx) => (
                                        <label
                                            key={item.id || idx}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.4rem 0.6rem',
                                                borderRadius: '6px',
                                                background: item.completado ? 'rgba(16, 185, 129, 0.06)' : 'var(--bg-card)',
                                                border: item.completado ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-color)',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                fontSize: '0.8rem',
                                                color: item.completado ? 'var(--text-muted)' : 'var(--text-primary)',
                                                textDecoration: item.completado ? 'line-through' : 'none'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={Boolean(item.completado)}
                                                onChange={() => handleToggleChecklist(selectedTask, idx)}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                            <span>{item.texto}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Comments / Bitácora Section */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <MessageSquare size={14} />
                                Bitácora y Comentarios ({taskComments.length})
                            </span>

                            {/* Comments history list */}
                            <div style={{
                                maxHeight: '180px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.45rem',
                                padding: '0.45rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '6px'
                            }}>
                                {taskComments.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem 0' }}>
                                        No hay comentarios registrados en esta tarea.
                                    </p>
                                ) : (
                                    taskComments.map(c => (
                                        <div
                                            key={c.id}
                                            style={{
                                                padding: '0.45rem 0.65rem',
                                                background: 'var(--bg-card)',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '2px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                                <strong style={{ color: 'var(--primary)' }}>{c.user_name || c.username}</strong>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{formatDateTimeSpanish(c.created_at)}</span>
                                            </div>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>
                                                {c.comentario}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add comment input */}
                            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.45rem' }}>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Escribe un comentario o nota de avance..."
                                    value={newCommentText}
                                    onChange={(e) => setNewCommentText(e.target.value)}
                                    style={{ height: '34px', fontSize: '0.8rem' }}
                                />
                                <button
                                    type="submit"
                                    disabled={submittingComment || !newCommentText.trim()}
                                    className="btn-primary"
                                    style={{ height: '34px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    <Send size={13} />
                                    <span>Enviar</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </Modal>
            )}

            {/* MODAL COMPARTIDO MIBOT TELEGRAM PARA AGENDAR / NOTIFICAR TAREAS, ACTIVIDADES Y REUNIONES */}
            <MibotProgramarModal
                open={mibotModalOpen}
                onClose={() => {
                    setMibotModalOpen(false);
                    setMibotTargetTask(null);
                }}
                taskRow={mibotTargetTask}
                defaultTipo={mibotDefaultTipo}
                onSaved={(resData) => {
                    fetchTasks(true);
                    fetchMibotProgramaciones();
                    if (resData?.task) {
                        setRecentAssignedCard({
                            task: resData.task,
                            mibot: { programacion: resData.programacion, dispatch: resData.dispatch },
                            timestamp: new Date().toISOString()
                        });
                    } else if (mibotTargetTask && resData?.programacion) {
                        setRecentAssignedCard({
                            task: mibotTargetTask,
                            mibot: { programacion: resData.programacion, dispatch: resData.dispatch },
                            timestamp: new Date().toISOString()
                        });
                    }
                }}
            />
        </div>
    );
}
