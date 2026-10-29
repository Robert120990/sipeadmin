import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    TrendingUp, Brain, Terminal, Send, RefreshCw, Plus, Trash2, Edit3,
    Pin, Sparkles, CheckCircle2, XCircle, ShieldCheck, Building2,
    FileText, Search, Layers, GitBranch, Calculator, Save, MessageSquare,
    ExternalLink, Play, AlertTriangle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { socket } from '../services/socket';
import { getStoredUser } from '../utils/auth';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { useTickets } from '../context/TicketContext';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';

const formatUSD = (val, decimals = 2) => {
    const n = Number(val || 0);
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

const ORIGEN_LABELS = {
    estudio_holding: { label: 'Estudio Holding', bg: 'rgba(139, 92, 246, 0.14)', color: '#8b5cf6' },
    auto_sistema: { label: 'Auto-Sistema BD', bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6' },
    auto_conversacion: { label: 'Auto-Chat IA', bg: 'rgba(16, 185, 129, 0.14)', color: '#10b981' },
    auto_graphify: { label: 'Auto-Graphify/AGY', bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706' },
    manual: { label: 'Regla Manual', bg: 'rgba(99, 102, 241, 0.14)', color: '#6366f1' }
};

const AGY_STATE_BADGES = {
    idle: { label: 'En Espera', bg: 'rgba(148, 163, 184, 0.16)', color: 'var(--text-muted)' },
    planificando: { label: 'Planificando en Servidor...', bg: 'rgba(59, 130, 246, 0.16)', color: '#3b82f6' },
    esperando_aprobacion: { label: 'Esperando Aprobación', bg: 'rgba(245, 158, 11, 0.18)', color: '#d97706' },
    ejecutando: { label: 'Ejecutando en Servidor...', bg: 'rgba(139, 92, 246, 0.18)', color: '#8b5cf6' },
    completado: { label: 'Ejecutado en Servidor', bg: 'rgba(16, 185, 129, 0.18)', color: '#10b981' },
    denegado: { label: 'Plan Denegado', bg: 'rgba(239, 68, 68, 0.16)', color: '#ef4444' },
    error: { label: 'Error en Consola', bg: 'rgba(239, 68, 68, 0.16)', color: '#ef4444' }
};

const QUICK_PROMPTS = [
    {
        label: 'Consolidación $10M + Granja',
        mode: 'consultoria_financiera',
        text: 'Evalúa el flujo mensual y DSCR de consolidar $5M de préstamos actuales más $5M para la Granja Avícola ($10M total) con integración comercial hacia ANDELSA.'
    },
    {
        label: 'Holding + TechCo Decreto 741',
        mode: 'consultoria_financiera',
        text: '¿Cómo debemos operar legalmente entre la Holding LLC en EE. UU., TechCo bajo Decreto 741 (0% ISR) para sys.sipesv.com y admin.sipesv.com, y AssetCo inmobiliaria?'
    },
    {
        label: 'Arbitraje Deuda vs Liquidez',
        mode: 'consultoria_financiera',
        text: 'Cruza nuestros saldos reales en bancos, costo ponderado de préstamos, ventas de estaciones y proyectos para recomendar si prepagar deuda o acelerar CapEx.'
    },
    {
        label: 'AGY: Mapa Graphify de Finanzas',
        mode: 'consola_agy',
        text: 'Inspecciona con Graphify los archivos de Finanzas en el servidor y proponme qué mejoras de automatización financiera podemos construir con AGY.'
    }
];

function SafeMarkdownView({ text = '' }) {
    if (!text) return null;
    const lines = String(text).split('\n');

    const renderInline = (lineText) => {
        const parts = String(lineText).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return parts.map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={idx} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return (
                    <code
                        key={idx}
                        style={{
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: 'var(--primary)',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.78rem'
                        }}
                    >
                        {part.slice(1, -1)}
                    </code>
                );
            }
            return <React.Fragment key={idx}>{part}</React.Fragment>;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.32rem', fontSize: '0.83rem', lineHeight: 1.55 }}>
            {lines.map((rawLine, idx) => {
                const line = rawLine.trim();
                if (!line) return <div key={idx} style={{ height: '0.2rem' }} />;
                if (line.startsWith('#### ')) {
                    return <h5 key={idx} style={{ margin: '0.35rem 0 0.1rem', fontSize: '0.86rem', fontWeight: 700, color: 'var(--primary)' }}>{renderInline(line.slice(5))}</h5>;
                }
                if (line.startsWith('### ')) {
                    return <h4 key={idx} style={{ margin: '0.4rem 0 0.15rem', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text)' }}>{renderInline(line.slice(4))}</h4>;
                }
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    const clean = line.replace(/^#+\s*/, '');
                    return <h4 key={idx} style={{ margin: '0.45rem 0 0.15rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>{renderInline(clean)}</h4>;
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                    return (
                        <div key={idx} style={{ display: 'flex', gap: '0.45rem', paddingLeft: '0.25rem' }}>
                            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>•</span>
                            <span style={{ flex: 1 }}>{renderInline(line.slice(2))}</span>
                        </div>
                    );
                }
                if (/^\d+\.\s+/.test(line)) {
                    const numMatch = line.match(/^(\d+\.)\s+(.*)$/);
                    return (
                        <div key={idx} style={{ display: 'flex', gap: '0.45rem', paddingLeft: '0.25rem' }}>
                            <span style={{ color: 'var(--primary)', fontWeight: 700, minWidth: '1.1rem' }}>{numMatch[1]}</span>
                            <span style={{ flex: 1 }}>{renderInline(numMatch[2])}</span>
                        </div>
                    );
                }
                return <p key={idx} style={{ margin: 0 }}>{renderInline(rawLine)}</p>;
            })}
        </div>
    );
}

export default function FinanzasCrecimiento() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const { openTicketDetail } = useTickets();
    const currentUser = getStoredUser();

    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        if (Number(currentUser.role_id) === 1) return true;
        const r = String(currentUser.role || currentUser.role_name || '').toLowerCase();
        return ['admin', 'administrator', 'administrador', 'super admin', 'superadmin'].includes(r);
    }, [currentUser]);

    const [activeTab, setActiveTab] = useState('consola');
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [loadingContext, setLoadingContext] = useState(false);

    // Contexto vivo y estado servidor AGY
    const [snapshot, setSnapshot] = useState(null);
    const [agyStatus, setAgyStatus] = useState(null);
    const [categorias, setCategorias] = useState([]);
    const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, fijados: 0, auto_construidos: 0 });

    // Conversaciones y Consola AGY
    const [conversaciones, setConversaciones] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [mensajes, setMensajes] = useState([]);
    const [chatMode, setChatMode] = useState('consultoria_financiera');
    const [targetProject, setTargetProject] = useState('sipeadmin');
    const [selectedModel, setSelectedModel] = useState('gemini-4-argon-high');
    const [autoLearnEnabled, setAutoLearnEnabled] = useState(true);
    const [chatInput, setChatInput] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [showExecutionLog, setShowExecutionLog] = useState(false);
    const [autoCommitOnExec, setAutoCommitOnExec] = useState(false);
    const chatBottomRef = useRef(null);

    // Modal de Planificación AGY
    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [planInstruction, setPlanInstruction] = useState('');
    const [syncWithTickets, setSyncWithTickets] = useState(true);
    const [runningAgyAction, setRunningAgyAction] = useState(false);

    // Base de Conocimientos (Auto-Build)
    const [knowledgeList, setKnowledgeList] = useState([]);
    const [loadingKnowledge, setLoadingKnowledge] = useState(false);
    const [autoBuilding, setAutoBuilding] = useState(false);
    const [kbFilterCat, setKbFilterCat] = useState('todas');
    const [kbFilterOrigin, setKbFilterOrigin] = useState('todos');
    const [kbOnlyPinned, setKbOnlyPinned] = useState(false);
    const [kbSearch, setKbSearch] = useState('');

    // Modal Crear/Editar Conocimiento
    const [kbModalOpen, setKbModalOpen] = useState(false);
    const [editingKb, setEditingKb] = useState(null);
    const [kbForm, setKbForm] = useState({
        categoria: 'estrategia_crecimiento',
        titulo: '',
        resumen_ejecutivo: '',
        contenido: '',
        etiquetas: 'estrategia,holding',
        fijado: true
    });

    // Inspector Graphify
    const [graphQuery, setGraphQuery] = useState('finanzas prestamos agy');
    const [graphResults, setGraphResults] = useState({ matches: [], related_files: [] });
    const [loadingGraph, setLoadingGraph] = useState(false);

    // Simulador Holding & Consolidación $10M
    const [simForm, setSimForm] = useState({
        deuda_actual_usd: 5000000,
        tasa_actual_pct: 9.25,
        plazo_actual_meses: 60,
        capex_granja_usd: 5000000,
        nueva_tasa_pct: 7.65,
        nuevo_plazo_meses: 120,
        meses_gracia_granja: 18,
        ebitda_actual_anual_usd: 1650000,
        ebitda_granja_anual_usd: 1250000,
        sinergia_andelsa_anual_usd: 240000,
        regalias_techco_anual_usd: 180000,
        tasa_isr_pct: 30
    });
    const [simResults, setSimResults] = useState(null);
    const [runningSim, setRunningSim] = useState(false);

    // ReportPreviewModal (Tamaño Carta completo)
    const [pdfPreview, setPdfPreview] = useState({ open: false, blob: null, totalPages: 1, subtitle: '' });

    const fetchCatalogos = async () => {
        try {
            const res = await api.get('/finanzas/catalogos');
            setEmpresas(res.data?.empresas || []);
        } catch { /* ignore */ }
    };

    const fetchContexto = async (empId = selectedEmpresa) => {
        setLoadingContext(true);
        try {
            const res = await api.get('/finanzas/crecimiento/contexto', {
                params: empId ? { empresa_id: empId } : {}
            });
            if (res.data?.success) {
                setSnapshot(res.data.snapshot);
                setAgyStatus(res.data.agy_status);
                setCategorias(res.data.categorias_conocimiento || []);
                setKnowledgeStats(res.data.stats_conocimiento || { total: 0, fijados: 0, auto_construidos: 0 });
                if (res.data.agy_status?.default_model) {
                    setSelectedModel(res.data.agy_status.default_model);
                }
                if (res.data.simulacion_default && !simResults) {
                    setSimForm(res.data.simulacion_default.parametros);
                    setSimResults(res.data.simulacion_default.resultados);
                }
            }
        } catch {
            addToast('No se pudo cargar el pulso de Crecimiento Empresarial', 'error');
        } finally {
            setLoadingContext(false);
        }
    };

    const fetchConversaciones = async (selectFirstIfEmpty = false) => {
        try {
            const res = await api.get('/finanzas/crecimiento/conversaciones');
            const list = res.data?.data || [];
            setConversaciones(list);
            if (selectFirstIfEmpty && !activeConv && list.length > 0) {
                loadConversationDetail(list[0].id);
            }
        } catch { /* ignore */ }
    };

    const loadConversationDetail = async (convId) => {
        if (!convId) return;
        try {
            const res = await api.get(`/finanzas/crecimiento/conversaciones/${convId}`);
            if (res.data?.success) {
                const c = res.data.conversacion;
                setActiveConv(c);
                setMensajes(res.data.mensajes || []);
                if (c.modo) setChatMode(c.modo);
                if (c.proyecto_destino) setTargetProject(c.proyecto_destino);
                if (c.modelo_ia) setSelectedModel(c.modelo_ia);
            }
        } catch {
            addToast('Error al cargar el hilo de conversación', 'error');
        }
    };

    const fetchKnowledgeBase = async () => {
        setLoadingKnowledge(true);
        try {
            const res = await api.get('/finanzas/crecimiento/conocimiento', {
                params: {
                    categoria: kbFilterCat,
                    origen: kbFilterOrigin,
                    fijado: kbOnlyPinned ? '1' : undefined,
                    search: kbSearch || undefined
                }
            });
            setKnowledgeList(res.data?.data || []);
        } catch {
            addToast('Error al consultar la Base de Conocimientos', 'error');
        } finally {
            setLoadingKnowledge(false);
        }
    };

    const handleSearchGraphify = async (qOverride = null) => {
        const q = qOverride !== null ? qOverride : graphQuery;
        setLoadingGraph(true);
        try {
            const res = await api.get('/finanzas/crecimiento/graphify', { params: { q } });
            if (res.data?.success) {
                setGraphResults({
                    matches: res.data.matches || [],
                    related_files: res.data.related_files || []
                });
            }
        } catch { /* ignore */ } finally {
            setLoadingGraph(false);
        }
    };

    useEffect(() => {
        fetchCatalogos();
        fetchContexto('');
        fetchConversaciones(true);
        fetchKnowledgeBase();
        handleSearchGraphify('finanzas prestamos agy');
    }, []);

    useEffect(() => {
        fetchKnowledgeBase();
    }, [kbFilterCat, kbFilterOrigin, kbOnlyPinned]);

    useEffect(() => {
        if (chatBottomRef.current) {
            chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [mensajes, sendingChat]);

    // Suscripción en tiempo real Socket.io para cambios de Consola AGY
    useEffect(() => {
        if (!socket) return undefined;
        const onAgyUpdate = (payload) => {
            fetchConversaciones(false);
            if (activeConv && Number(payload?.conversacion_id) === Number(activeConv.id)) {
                loadConversationDetail(activeConv.id);
            }
            if (payload?.estado_agy === 'completado') {
                fetchKnowledgeBase();
                fetchContexto();
            }
        };
        socket.on('crecimiento:agy_update', onAgyUpdate);
        return () => {
            socket.off('crecimiento:agy_update', onAgyUpdate);
        };
    }, [activeConv]);

    const handleAutoBuildSync = async () => {
        setAutoBuilding(true);
        try {
            const res = await api.post('/finanzas/crecimiento/conocimiento/auto-build', {
                empresa_id: selectedEmpresa || null
            });
            addToast(res.data?.message || 'Auto-Build sincronizado con éxito', 'success');
            await Promise.all([fetchContexto(), fetchKnowledgeBase()]);
        } catch {
            addToast('Error al ejecutar Auto-Build de conocimientos', 'error');
        } finally {
            setAutoBuilding(false);
        }
    };

    const handleNewConversation = () => {
        setActiveConv(null);
        setMensajes([]);
        setChatInput('');
    };

    const handleSendMessage = async (e, overrideText = null, overrideMode = null) => {
        if (e) e.preventDefault();
        const text = String(overrideText !== null ? overrideText : chatInput).trim();
        if (!text || sendingChat) return;

        const modeToUse = overrideMode || chatMode;
        if (overrideMode) setChatMode(overrideMode);
        if (overrideText === null) setChatInput('');

        const optimisticMsg = {
            id: `temp-${Date.now()}`,
            rol: 'user',
            autor: currentUser?.nombre || currentUser?.username || 'Tú',
            contenido: text,
            created_at: new Date().toISOString()
        };
        setMensajes((prev) => [...prev, optimisticMsg]);
        setSendingChat(true);

        try {
            const res = await api.post('/finanzas/crecimiento/conversaciones/mensaje', {
                conversacion_id: activeConv?.id || null,
                modo: modeToUse,
                proyecto_destino: targetProject,
                modelo_ia: selectedModel,
                empresa_id: selectedEmpresa || null,
                mensaje: text,
                auto_learn: autoLearnEnabled,
                simulacion_params: simForm
            });

            if (res.data?.success) {
                if (res.data.conocimientos_aprendidos?.length > 0) {
                    addToast(`Auto-Build: +${res.data.conocimientos_aprendidos.length} conocimiento(s) guardado(s) en memoria`, 'success');
                    fetchKnowledgeBase();
                    fetchContexto();
                }
                await loadConversationDetail(res.data.conversacion_id);
                await fetchConversaciones(false);
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al consultar Estratega & Consola AGY', 'error');
        } finally {
            setSendingChat(false);
        }
    };

    const handleDeleteConversation = async (conv) => {
        const ok = await confirm(`¿Eliminar el hilo "${conv.titulo}" y todo su historial?`, { variant: 'danger' });
        if (!ok) return;
        try {
            await api.delete(`/finanzas/crecimiento/conversaciones/${conv.id}`);
            addToast('Conversación eliminada', 'success');
            if (activeConv?.id === conv.id) {
                handleNewConversation();
            }
            fetchConversaciones(false);
        } catch {
            addToast('Error al eliminar conversación', 'error');
        }
    };

    const openPlanAgyModal = (suggestedInstruction = '') => {
        if (!activeConv) {
            addToast('Inicia o selecciona primero una conversación para generar un Plan AGY', 'warning');
            return;
        }
        const lastUserMsg = [...mensajes].reverse().find((m) => m.rol === 'user')?.contenido || '';
        setPlanInstruction(suggestedInstruction || lastUserMsg || activeConv.titulo || '');
        setPlanModalOpen(true);
    };

    const handleGenerateAgyPlan = async (e) => {
        if (e) e.preventDefault();
        if (!activeConv) return;
        setRunningAgyAction(true);
        try {
            const res = await api.post(`/finanzas/crecimiento/conversaciones/${activeConv.id}/agy-plan`, {
                instruction: planInstruction,
                model: selectedModel,
                proyecto_destino: targetProject,
                sync_ticket: syncWithTickets
            });
            addToast(res.data?.message || 'Plan AGY generado en el servidor', 'success');
            setPlanModalOpen(false);
            await loadConversationDetail(activeConv.id);
            await fetchConversaciones(false);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al generar Plan AGY en el servidor', 'error');
        } finally {
            setRunningAgyAction(false);
        }
    };

    const handleExecuteAgyPlan = async () => {
        if (!activeConv) return;
        const ok = await confirm(
            `¿Aprobar y ejecutar en el servidor el Plan AGY v${activeConv.plan_version || 1} sobre ${targetProject === 'sipesaas' ? 'sys.sipesv.com' : 'admin.sipesv.com'}?`
        );
        if (!ok) return;

        setRunningAgyAction(true);
        try {
            const res = await api.post(`/finanzas/crecimiento/conversaciones/${activeConv.id}/agy-execute`, {
                auto_commit_push: autoCommitOnExec
            });
            addToast(res.data?.message || 'Ejecución AGY finalizada', 'success');
            await Promise.all([loadConversationDetail(activeConv.id), fetchConversaciones(false), fetchKnowledgeBase()]);
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo ejecutar el Plan AGY', 'error');
        } finally {
            setRunningAgyAction(false);
        }
    };

    const handleRejectAgyPlan = async () => {
        if (!activeConv) return;
        const ok = await confirm('¿Estás seguro de denegar el Plan AGY actual?', { variant: 'danger' });
        if (!ok) return;
        setRunningAgyAction(true);
        try {
            await api.post(`/finanzas/crecimiento/conversaciones/${activeConv.id}/agy-reject`, {
                reason: 'Denegado desde Consola de Crecimiento Empresarial para replantear alcance'
            });
            addToast('Plan AGY denegado', 'warning');
            await loadConversationDetail(activeConv.id);
        } catch {
            addToast('Error al denegar Plan AGY', 'error');
        } finally {
            setRunningAgyAction(false);
        }
    };

    // CRUD Base de Conocimientos
    const openCreateKbModal = () => {
        setEditingKb(null);
        setKbForm({
            categoria: 'estrategia_crecimiento',
            titulo: '',
            resumen_ejecutivo: '',
            contenido: '',
            etiquetas: 'estrategia,holding,finanzas',
            fijado: true
        });
        setKbModalOpen(true);
    };

    const openEditKbModal = (item) => {
        setEditingKb(item);
        setKbForm({
            categoria: item.categoria || 'estrategia_crecimiento',
            titulo: item.titulo || '',
            resumen_ejecutivo: item.resumen_ejecutivo || '',
            contenido: item.contenido || '',
            etiquetas: item.etiquetas || '',
            fijado: Boolean(item.fijado)
        });
        setKbModalOpen(true);
    };

    const handleSaveKb = async (e) => {
        e.preventDefault();
        try {
            if (editingKb) {
                await api.put(`/finanzas/crecimiento/conocimiento/${editingKb.id}`, kbForm);
                addToast('Conocimiento actualizado', 'success');
            } else {
                await api.post('/finanzas/crecimiento/conocimiento', kbForm);
                addToast('Nuevo conocimiento incorporado a la memoria IA', 'success');
            }
            setKbModalOpen(false);
            await Promise.all([fetchKnowledgeBase(), fetchContexto()]);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar conocimiento', 'error');
        }
    };

    const handleTogglePinKb = async (item) => {
        try {
            await api.put(`/finanzas/crecimiento/conocimiento/${item.id}`, {
                fijado: !item.fijado
            });
            addToast(!item.fijado ? 'Fijado en contexto permanente de IA/AGY' : 'Desfijado de prioridad permanente', 'success');
            fetchKnowledgeBase();
            fetchContexto();
        } catch {
            addToast('No se pudo actualizar estado fijado', 'error');
        }
    };

    const handleDeleteKb = async (item) => {
        const ok = await confirm(`¿Eliminar el conocimiento "${item.titulo}" de la memoria empresarial?`, { variant: 'danger' });
        if (!ok) return;
        try {
            await api.delete(`/finanzas/crecimiento/conocimiento/${item.id}`);
            addToast('Conocimiento eliminado', 'success');
            await Promise.all([fetchKnowledgeBase(), fetchContexto()]);
        } catch {
            addToast('Error al eliminar conocimiento', 'error');
        }
    };

    // Simulador $10M + Holding
    const handleRunSimulation = async (saveToKb = false) => {
        setRunningSim(true);
        try {
            const res = await api.post('/finanzas/crecimiento/simular', {
                ...simForm,
                guardar_conocimiento: saveToKb
            });
            if (res.data?.success) {
                setSimResults(res.data.resultados);
                if (saveToKb) {
                    addToast('Escenario guardado en Base de Conocimientos para futuras consultas IA', 'success');
                    fetchKnowledgeBase();
                    fetchContexto();
                } else {
                    addToast('Simulación financiera recalculada', 'success');
                }
            }
        } catch {
            addToast('Error al calcular escenario financiero', 'error');
        } finally {
            setRunningSim(false);
        }
    };

    // Generación de Reporte PDF Tamaño Carta completo con ReportPreviewModal
    const handleOpenExecutivePdf = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const pageW = doc.internal.pageSize.getWidth();
        const nowStr = new Date().toLocaleString('es-SV');

        // Encabezado corporativo
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('GRUPO SIPE — CRECIMIENTO EMPRESARIAL, HOLDING & CONSOLA AGY', 14, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Reporte Ejecutivo Consolidado (Tamaño Carta) | Generado: ${nowStr}`, 14, 19);
        doc.text(`Nodos Memoria IA: ${knowledgeStats.total} | Nodos Graphify: ${snapshot?.graphify?.total_nodes || 0}`, 14, 24);

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('1. Pulso Financiero y Operativo Multi-Base en Tiempo Real', 14, 36);

        autoTable(doc, {
            startY: 39,
            head: [['Indicador Corporativo', 'Valor Actual', 'Detalle Operativo']],
            body: [
                [
                    'Deuda Bancaria Activa',
                    formatUSD(snapshot?.deuda?.saldo_total_usd || 0),
                    `${snapshot?.deuda?.prestamos_activos || 0} préstamos | Tasa ponderada: ${snapshot?.deuda?.tasa_ponderada_anual_pct || 0}% | Cuota: ${formatUSD(snapshot?.deuda?.cuota_mensual_total_usd || 0)}/mes`
                ],
                [
                    'Liquidez en Bancos y Chequeras',
                    formatUSD(snapshot?.liquidez_bancos?.saldo_bancos_usd || 0),
                    `${snapshot?.liquidez_bancos?.total_cuentas || 0} cuentas activas | Chequera: ${formatUSD(snapshot?.liquidez_bancos?.saldo_chequera_usd || 0)}`
                ],
                [
                    'Estaciones y Tiendas (Run-Rate)',
                    formatUSD(snapshot?.operaciones_estaciones?.proyeccion_mensual_ingresos_usd || 0),
                    `Corte ${snapshot?.operaciones_estaciones?.fecha_corte || 'reciente'}: ${(snapshot?.operaciones_estaciones?.galones_ayer || 0).toLocaleString('en-US')} galones diarios`
                ],
                [
                    'ANDELSA, S.A. DE C.V. (Mes)',
                    formatUSD(snapshot?.andelsa?.facturacion_mes_usd || 0),
                    `Inventario: ${formatUSD(snapshot?.andelsa?.valor_inventario_usd || 0)} | CxC: ${formatUSD(snapshot?.andelsa?.cartera_por_cobrar_usd || 0)}`
                ],
                [
                    'Energía Solar y Baterías',
                    `${snapshot?.energia_solar?.potencia_total_kwp || 0} kWp`,
                    `Baterías: ${snapshot?.energia_solar?.capacidad_bateria_kwh || 0} kWh | Ahorro mes: ${formatUSD(snapshot?.energia_solar?.ahorro_mes_usd || 0)}`
                ]
            ],
            styles: { fontSize: 8, cellPadding: 2.2 },
            headStyles: { fillColor: [30, 64, 175], textColor: 255 }
        });

        let nextY = (doc.lastAutoTable?.finalY || 85) + 8;

        if (simResults) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('2. Simulación Reestructuración $10M (Deuda + Granja Avícola + Escudos Holding)', 14, nextY);

            autoTable(doc, {
                startY: nextY + 3,
                head: [['Métrica Estructural', 'Actual ($5M)', `Gracia (${simForm.meses_gracia_granja}m)`, 'Estabilizado ($10M + Granja)']],
                body: [
                    ['Capital Financiado', formatUSD(simForm.deuda_actual_usd, 0), formatUSD(Number(simForm.deuda_actual_usd) + Number(simForm.capex_granja_usd), 0), formatUSD(Number(simForm.deuda_actual_usd) + Number(simForm.capex_granja_usd), 0)],
                    ['Cuota Mensual Total', formatUSD(simResults.cuota_mensual_actual_usd), formatUSD(simResults.cuota_total_durante_gracia_usd), formatUSD(simResults.cuota_total_estabilizada_usd)],
                    ['EBITDA Anual Respaldo', formatUSD(simForm.ebitda_actual_anual_usd, 0), formatUSD(simForm.ebitda_actual_anual_usd, 0), formatUSD(simResults.ebitda_consolidado_estabilizado_usd, 0)],
                    ['Cobertura DSCR', `${simResults.dscr_actual}x`, `${simResults.dscr_durante_gracia}x`, `${simResults.dscr_estabilizado}x (${simResults.viabilidad})`],
                    ['Escudo Fiscal Legal Anual', '$0.00', formatUSD(simResults.ahorro_fiscal_total_anual_usd), formatUSD(simResults.ahorro_fiscal_total_anual_usd)],
                    ['Flujo Libre Anual Post-Deuda', formatUSD(Number(simForm.ebitda_actual_anual_usd) - Number(simResults.servicio_anual_actual_usd)), 'Etapa Construcción', formatUSD(simResults.flujo_libre_anual_post_deuda_usd)]
                ],
                styles: { fontSize: 8, cellPadding: 2.2 },
                headStyles: { fillColor: [5, 150, 105], textColor: 255 }
            });
            nextY = (doc.lastAutoTable?.finalY || 145) + 8;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('3. Nodos Fijados en Base de Conocimientos Institucional (Auto-Build)', 14, nextY);

        autoTable(doc, {
            startY: nextY + 3,
            head: [['Categoría', 'Título Estratégico', 'Resumen Ejecutivo']],
            body: knowledgeList.slice(0, 8).map((k) => [
                k.categoria,
                k.titulo,
                String(k.resumen_ejecutivo || k.contenido || '').slice(0, 145)
            ]),
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [79, 70, 229], textColor: 255 }
        });

        const totalPages = doc.internal.getNumberOfPages();
        const blob = doc.output('blob');
        setPdfPreview({
            open: true,
            blob,
            totalPages,
            subtitle: `Deuda: ${formatUSD(snapshot?.deuda?.saldo_total_usd || 0)} | Conocimientos IA: ${knowledgeStats.total} nodos`
        });
    };

    const getCategoryLabel = (catId) => {
        const found = categorias.find((c) => c.id === catId);
        return found ? found.label : catId;
    };

    const agyBadge = AGY_STATE_BADGES[activeConv?.estado_agy || 'idle'] || AGY_STATE_BADGES.idle;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header Compacto */}
            <div className="page-header" style={{ marginBottom: '0.25rem', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.22rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingUp size={21} style={{ color: 'var(--primary)' }} />
                        Crecimiento Empresarial, Memoria IA & Consola AGY
                    </h1>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Consultoría multi-base en vivo, Auto-Build de conocimientos estratégicos y operación continua con AGY en el servidor.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select
                        className="input-field"
                        value={selectedEmpresa}
                        onChange={(e) => {
                            setSelectedEmpresa(e.target.value);
                            fetchContexto(e.target.value);
                        }}
                        style={{ height: '36px', fontSize: '0.825rem', padding: '0 0.7rem', width: 'auto', minWidth: '180px' }}
                    >
                        <option value="">Consolidado Grupo SIPE</option>
                        {empresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={handleAutoBuildSync}
                        disabled={autoBuilding}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Sincronizar métricas multi-BD y Graphify en la Base de Conocimientos"
                    >
                        <Brain size={15} className={autoBuilding ? 'spin' : ''} style={{ color: '#8b5cf6' }} />
                        {autoBuilding ? 'Construyendo...' : 'Auto-Build Memoria'}
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenExecutivePdf}
                        className="btn btn-secondary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FileText size={15} />
                        Reporte Carta PDF
                    </button>

                    <button
                        type="button"
                        onClick={() => { fetchContexto(); fetchKnowledgeBase(); fetchConversaciones(false); }}
                        disabled={loadingContext}
                        className="btn btn-primary"
                        style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} className={loadingContext ? 'spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Tarjetas KPI Multi-BD (Responsive vía .form-grid .form-grid-3) */}
            <div className="form-grid form-grid-3" style={{ gap: '0.75rem' }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Deuda Activa & Costo Ponderado
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem' }}>
                        {formatUSD(snapshot?.deuda?.saldo_total_usd || 0)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Tasa: <strong>{snapshot?.deuda?.tasa_ponderada_anual_pct || 0}%</strong> | Cuota: {formatUSD(snapshot?.deuda?.cuota_mensual_total_usd || 0)}/mes
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '3px solid #10b981' }}>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Liquidez Bancos & ANDELSA
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem', color: '#10b981' }}>
                        {formatUSD(snapshot?.liquidez_bancos?.saldo_bancos_usd || 0)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        ANDELSA Mes: <strong>{formatUSD(snapshot?.andelsa?.facturacion_mes_usd || 0, 0)}</strong> | Solar: {snapshot?.energia_solar?.potencia_total_kwp || 0} kWp
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '3px solid #8b5cf6' }}>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Memoria IA & Servidor AGY
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span>{knowledgeStats.total} Nodos IA</span>
                        <span style={{ fontSize: '0.72rem', padding: '0.12rem 0.45rem', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                            AGY Online
                        </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Graphify: <strong>{snapshot?.graphify?.total_nodes || 0}</strong> nodos AST | Fijados: {knowledgeStats.fijados}
                    </div>
                </div>
            </div>

            {/* Navegación de Pestañas Compacta */}
            <div className="card glass" style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('consola')}
                        className={activeTab === 'consola' ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.81rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Terminal size={15} />
                        Consultoría Viva & Consola AGY
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('conocimiento')}
                        className={activeTab === 'conocimiento' ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.81rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Brain size={15} />
                        Base de Conocimientos ({knowledgeStats.total})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('simulador')}
                        className={activeTab === 'simulador' ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.81rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Building2 size={15} />
                        Simulador Holding & Consolidación $10M
                    </button>
                </div>

                {agyStatus && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <ShieldCheck size={14} style={{ color: '#10b981' }} />
                        <span>Motor Servidor: <strong>{agyStatus.engine_mode}</strong></span>
                    </div>
                )}
            </div>

            {/* =================================================================== */}
            {/* TAB 1: CONSULTORÍA VIVA & CONSOLA AGY EN EL SERVIDOR                */}
            {/* =================================================================== */}
            {activeTab === 'consola' && (
                <div className="form-grid form-grid-3" style={{ gap: '1rem', alignItems: 'start' }}>
                    {/* Columna Lateral: Hilos de Conversación + Estado AGY */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div className="card glass" style={{ padding: '0.9rem 1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <MessageSquare size={15} style={{ color: 'var(--primary)' }} />
                                    Hilos en Servidor ({conversaciones.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNewConversation}
                                    className="btn btn-primary"
                                    style={{ height: '32px', padding: '0 0.7rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    <Plus size={14} /> Nuevo
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '320px', overflowY: 'auto' }}>
                                {conversaciones.length === 0 ? (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.75rem 0', textAlign: 'center' }}>
                                        Envía tu primera consulta financiera o instrucción para AGY.
                                    </div>
                                ) : (
                                    conversaciones.map((c) => {
                                        const isSelected = activeConv?.id === c.id;
                                        const stBadge = AGY_STATE_BADGES[c.estado_agy || 'idle'] || AGY_STATE_BADGES.idle;
                                        return (
                                            <div
                                                key={c.id}
                                                onClick={() => loadConversationDetail(c.id)}
                                                style={{
                                                    padding: '0.55rem 0.65rem',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                    background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3, flex: 1 }}>
                                                        {c.titulo}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(c); }}
                                                        className="icon-btn"
                                                        style={{ padding: '2px', color: 'var(--text-muted)' }}
                                                        title="Eliminar hilo"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        padding: '0.1rem 0.4rem',
                                                        borderRadius: '4px',
                                                        background: c.modo === 'consola_agy' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                        color: c.modo === 'consola_agy' ? '#8b5cf6' : '#10b981',
                                                        fontWeight: 600
                                                    }}>
                                                        {c.modo === 'consola_agy' ? 'AGY Código' : 'Finanzas IA'}
                                                    </span>
                                                    {c.estado_agy && c.estado_agy !== 'idle' && (
                                                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: stBadge.bg, color: stBadge.color, fontWeight: 600 }}>
                                                            {stBadge.label}
                                                        </span>
                                                    )}
                                                    {c.ticket_code && (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)' }}>
                                                            #{c.ticket_code}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Tarjeta de Control de Modificaciones AGY en Servidor */}
                        <div className="card glass" style={{ padding: '0.95rem 1rem', borderTop: '3px solid #8b5cf6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <GitBranch size={15} style={{ color: '#8b5cf6' }} />
                                    Puente Modificaciones AGY
                                </span>
                                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: agyBadge.bg, color: agyBadge.color, fontWeight: 600 }}>
                                    {agyBadge.label}
                                </span>
                            </div>

                            <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', margin: '0 0 0.65rem', lineHeight: 1.45 }}>
                                Convierte cualquier análisis financiero o idea conversada en un <strong>Plan AGY en el servidor</strong>, sincronizado con Tickets/Telegram y listo para aplicar cambios.
                            </p>

                            {activeConv?.ticket_code && (
                                <div style={{ marginBottom: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.76rem' }}>
                                        Ticket vinculado: <strong>#{activeConv.ticket_code}</strong>
                                    </span>
                                    {activeConv.ticket_id && (
                                        <button
                                            type="button"
                                            onClick={() => openTicketDetail(activeConv.ticket_id)}
                                            className="btn btn-secondary"
                                            style={{ height: '28px', padding: '0 0.55rem', fontSize: '0.73rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                        >
                                            <ExternalLink size={12} /> Ver Ticket
                                        </button>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                <button
                                    type="button"
                                    onClick={() => openPlanAgyModal()}
                                    disabled={!activeConv || runningAgyAction}
                                    className="btn btn-secondary"
                                    style={{ height: '36px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderColor: '#8b5cf6', color: '#8b5cf6' }}
                                >
                                    <Sparkles size={15} />
                                    {activeConv?.plan_version > 0 ? `Replantear Plan AGY (v${activeConv.plan_version + 1})` : 'Generar Plan AGY en Servidor'}
                                </button>

                                {activeConv?.plan_markdown && (
                                    <>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', userSelect: 'none', cursor: 'pointer', marginTop: '0.2rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={autoCommitOnExec}
                                                onChange={(e) => setAutoCommitOnExec(e.target.checked)}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Registrar commit atómico al aplicar cambios
                                        </label>

                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                                            <button
                                                type="button"
                                                onClick={handleExecuteAgyPlan}
                                                disabled={!isAdmin || runningAgyAction || activeConv.estado_agy === 'ejecutando'}
                                                className="btn btn-primary"
                                                style={{ flex: 1, height: '36px', fontSize: '0.78rem', background: '#10b981', borderColor: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                                title={!isAdmin ? 'Solo Administradores pueden ejecutar modificaciones en el servidor' : 'Aprobar y ejecutar en el servidor'}
                                            >
                                                <Play size={14} />
                                                Aprobar y Ejecutar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRejectAgyPlan}
                                                disabled={runningAgyAction}
                                                className="btn btn-secondary"
                                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.78rem', color: '#ef4444' }}
                                            >
                                                <XCircle size={15} />
                                            </button>
                                        </div>

                                        {activeConv.execution_log && (
                                            <button
                                                type="button"
                                                onClick={() => setShowExecutionLog((prev) => !prev)}
                                                className="btn btn-secondary"
                                                style={{ height: '30px', fontSize: '0.74rem' }}
                                            >
                                                {showExecutionLog ? 'Ocultar Log de Servidor' : 'Ver Log de Consola Servidor'}
                                            </button>
                                        )}

                                        {showExecutionLog && activeConv.execution_log && (
                                            <pre style={{
                                                margin: 0,
                                                padding: '0.6rem',
                                                borderRadius: '6px',
                                                background: '#0f172a',
                                                color: '#e2e8f0',
                                                fontSize: '0.72rem',
                                                maxHeight: '190px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {activeConv.execution_log}
                                            </pre>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Columna Principal (.span-2): Consola Conversacional Financiera & AGY */}
                    <div className="span-2 card glass" style={{ padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Barra Superior de Modo, Repositorio y Modelo */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <select
                                    className="input-field"
                                    value={chatMode}
                                    onChange={(e) => setChatMode(e.target.value)}
                                    style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                                >
                                    <option value="consultoria_financiera">📈 Modo: Consultoría Financiera & Holding</option>
                                    <option value="consola_agy">🤖 Modo: Consola AGY Servidor (Código & Cambios)</option>
                                </select>

                                <select
                                    className="input-field"
                                    value={targetProject}
                                    onChange={(e) => setTargetProject(e.target.value)}
                                    style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                                >
                                    <option value="sipeadmin">Proyecto: admin.sipesv.com (SIPE Admin)</option>
                                    <option value="sipesaas">Proyecto: sys.sipesv.com (SIPE SaaS)</option>
                                </select>

                                <select
                                    className="input-field"
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                                >
                                    {(agyStatus?.available_models?.length > 0 ? agyStatus.available_models : [
                                        { id: 'gemini-4-argon-high', label: 'gemini-4-argon-high' },
                                        { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro' },
                                        { id: 'gemini-3-flash', label: 'gemini-3-flash' }
                                    ]).map((m) => (
                                        <option key={m.id} value={m.id}>{m.id}</option>
                                    ))}
                                </select>
                            </div>

                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={autoLearnEnabled}
                                    onChange={(e) => setAutoLearnEnabled(e.target.checked)}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                Auto-Build en chat
                            </label>
                        </div>

                        {/* Chips de Consultas Rápidas */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {QUICK_PROMPTS.map((qp, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSendMessage(null, qp.text, qp.mode)}
                                    disabled={sendingChat}
                                    style={{
                                        padding: '0.28rem 0.65rem',
                                        borderRadius: '999px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg)',
                                        color: 'var(--text)',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✨ {qp.label}
                                </button>
                            ))}
                        </div>

                        {/* Área de Mensajes */}
                        <div style={{
                            minHeight: '360px',
                            maxHeight: '470px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)'
                        }}>
                            {mensajes.length === 0 ? (
                                <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '500px', padding: '1.5rem 1rem' }}>
                                    <Sparkles size={28} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
                                    <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.98rem' }}>
                                        Centro Conversacional de Crecimiento & Consola AGY
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                        Consulta estrategias de Holding, impuestos, reestructuración de los $10M ($5M deuda + $5M Granja/Andelsa) con métricas reales del ERP, o cambia a <strong>Consola AGY</strong> para inspeccionar y modificar el sistema en el servidor.
                                    </p>
                                </div>
                            ) : (
                                mensajes.map((msg) => {
                                    const isUser = msg.rol === 'user';
                                    const isSystemAgy = msg.rol === 'agy_system';
                                    let learned = [];
                                    let meta = {};
                                    try {
                                        if (msg.conocimientos_extraidos_json) {
                                            learned = typeof msg.conocimientos_extraidos_json === 'string'
                                                ? JSON.parse(msg.conocimientos_extraidos_json)
                                                : msg.conocimientos_extraidos_json;
                                        }
                                        if (msg.metadata_json) {
                                            meta = typeof msg.metadata_json === 'string'
                                                ? JSON.parse(msg.metadata_json)
                                                : msg.metadata_json;
                                        }
                                    } catch { /* ignore */ }

                                    return (
                                        <div
                                            key={msg.id}
                                            style={{
                                                alignSelf: isUser ? 'flex-end' : 'stretch',
                                                maxWidth: isUser ? '84%' : '100%',
                                                padding: '0.7rem 0.9rem',
                                                borderRadius: '10px',
                                                background: isUser
                                                    ? 'var(--primary)'
                                                    : isSystemAgy
                                                        ? 'rgba(139, 92, 246, 0.09)'
                                                        : 'var(--surface)',
                                                color: isUser ? '#fff' : 'var(--text)',
                                                border: isUser ? 'none' : isSystemAgy ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid var(--border)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, opacity: isUser ? 0.9 : 0.75 }}>
                                                    {msg.autor || (isUser ? 'Tú' : 'Estratega & AGY')}
                                                </span>
                                                {Array.isArray(learned) && learned.length > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '0.12rem 0.45rem',
                                                        borderRadius: '999px',
                                                        background: 'rgba(16, 185, 129, 0.16)',
                                                        color: '#10b981',
                                                        fontWeight: 600
                                                    }}>
                                                        🧠 +{learned.length} conocimiento(s) auto-guardado(s)
                                                    </span>
                                                )}
                                            </div>

                                            {isUser ? (
                                                <div style={{ fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{msg.contenido}</div>
                                            ) : (
                                                <SafeMarkdownView text={msg.contenido} />
                                            )}

                                            {!isUser && Array.isArray(meta?.archivos_relacionados) && meta.archivos_relacionados.length > 0 && (
                                                <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                                        📂 Graphify: <code>{meta.archivos_relacionados.slice(0, 3).join(', ')}</code>
                                                    </span>
                                                    {meta.sugerir_modificacion_agy && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openPlanAgyModal(meta.instruccion_agy_sugerida || '')}
                                                            className="btn btn-secondary"
                                                            style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem', borderColor: '#8b5cf6', color: '#8b5cf6' }}
                                                        >
                                                            📋 Planificar este cambio con AGY
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {sendingChat && (
                                <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Consultando métricas vivas, Base de Conocimientos y Graphify en el servidor...
                                </div>
                            )}
                            <div ref={chatBottomRef} />
                        </div>

                        {/* Formulario de Envío */}
                        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                className="input-field"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder={
                                    chatMode === 'consola_agy'
                                        ? 'Escribe una consulta de arquitectura o solicita una modificación para AGY en el servidor...'
                                        : 'Pregunta sobre crecimiento, Holding, $10M + Granja, impuestos o escribe "Regla: ..." para enseñar a la IA...'
                                }
                                disabled={sendingChat}
                                style={{ flex: 1, minWidth: '210px', height: '38px', fontSize: '0.825rem' }}
                            />
                            <button
                                type="submit"
                                disabled={sendingChat || !chatInput.trim()}
                                className="btn btn-primary"
                                style={{ height: '38px', padding: '0 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Send size={15} />
                                Enviar
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* =================================================================== */}
            {/* TAB 2: BASE DE CONOCIMIENTOS AUTOCONSTRUIBLE + INSPECTOR GRAPHIFY   */}
            {/* =================================================================== */}
            {activeTab === 'conocimiento' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Barra de Filtros Compacta */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', flex: 1 }}>
                            <div style={{ position: 'relative', minWidth: '200px', flex: 1, maxWidth: '300px' }}>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Buscar regla, holding, deuda, granja..."
                                    value={kbSearch}
                                    onChange={(e) => setKbSearch(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') fetchKnowledgeBase(); }}
                                    style={{ height: '36px', fontSize: '0.825rem', paddingRight: '2rem' }}
                                />
                                <Search size={15} style={{ position: 'absolute', right: '0.65rem', top: '10px', color: 'var(--text-muted)' }} />
                            </div>

                            <select
                                className="input-field"
                                value={kbFilterCat}
                                onChange={(e) => setKbFilterCat(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                            >
                                <option value="todas">Todas las Categorías</option>
                                {categorias.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>

                            <select
                                className="input-field"
                                value={kbFilterOrigin}
                                onChange={(e) => setKbFilterOrigin(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                            >
                                <option value="todos">Todos los Orígenes</option>
                                <option value="estudio_holding">Estudio Holding</option>
                                <option value="auto_sistema">Auto-Sistema Multi-BD</option>
                                <option value="auto_conversacion">Auto-Conversación IA</option>
                                <option value="auto_graphify">Auto-Graphify / AGY</option>
                                <option value="manual">Manual</option>
                            </select>

                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={kbOnlyPinned}
                                    onChange={(e) => setKbOnlyPinned(e.target.checked)}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                Solo fijados
                            </label>

                            <button
                                type="button"
                                onClick={fetchKnowledgeBase}
                                className="btn btn-secondary"
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem' }}
                            >
                                Filtrar
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleAutoBuildSync}
                                disabled={autoBuilding}
                                className="btn btn-secondary"
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RefreshCw size={14} className={autoBuilding ? 'spin' : ''} />
                                Sincronizar Auto-Build
                            </button>
                            <button
                                type="button"
                                onClick={openCreateKbModal}
                                className="btn btn-primary"
                                style={{ height: '36px', padding: '0 1.1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <Plus size={15} />
                                Nueva Regla / Conocimiento
                            </button>
                        </div>
                    </div>

                    {/* Tabla Compacta de Conocimientos (.table-responsive + minWidth) */}
                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(148, 163, 184, 0.06)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', width: '56px' }}>Fijo</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left', width: '175px' }}>Categoría</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left' }}>Conocimiento Estratégico / Regla</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', width: '140px' }}>Origen</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', width: '75px' }}>Usos IA</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', width: '100px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingKnowledge ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '1.25rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Cargando Base de Conocimientos...
                                        </td>
                                    </tr>
                                ) : knowledgeList.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '1.25rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            No se encontraron nodos de conocimiento con los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : (
                                    knowledgeList.map((item) => {
                                        const orig = ORIGEN_LABELS[item.origen] || ORIGEN_LABELS.manual;
                                        return (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTogglePinKb(item)}
                                                        className="icon-btn"
                                                        title={item.fijado ? 'Fijado en prompt IA (clic para desfijar)' : 'Clic para fijar permanentemente'}
                                                        style={{ color: item.fijado ? 'var(--primary)' : 'var(--text-muted)' }}
                                                    >
                                                        <Pin size={15} />
                                                    </button>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', fontWeight: 600 }}>
                                                    {getCategoryLabel(item.categoria)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{item.titulo}</div>
                                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                                                        {item.resumen_ejecutivo || String(item.contenido || '').slice(0, 180)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '999px',
                                                        background: orig.bg,
                                                        color: orig.color,
                                                        fontWeight: 600
                                                    }}>
                                                        {orig.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'center', fontWeight: 600 }}>
                                                    {item.veces_usado || 0}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditKbModal(item)}
                                                            className="icon-btn"
                                                            title="Ver / Editar"
                                                        >
                                                            <Edit3 size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteKb(item)}
                                                            className="icon-btn"
                                                            style={{ color: '#ef4444' }}
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={15} />
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

                    {/* Inspector Determinista Graphify AST */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Layers size={16} style={{ color: '#f59e0b' }} />
                                    Explorador de Conocimiento de Código (Graphify AST)
                                </h3>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                    Consulta qué tablas, servicios y componentes conoce AGY en el grafo del servidor antes de solicitar modificaciones.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={graphQuery}
                                    onChange={(e) => setGraphQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchGraphify(); }}
                                    placeholder="Ej: prestamos cheques andelsa tickets..."
                                    style={{ height: '36px', fontSize: '0.8rem', width: '240px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => handleSearchGraphify()}
                                    disabled={loadingGraph}
                                    className="btn btn-secondary"
                                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem' }}
                                >
                                    {loadingGraph ? 'Consultando...' : 'Consultar Grafo'}
                                </button>
                            </div>
                        </div>

                        {graphResults.related_files.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {graphResults.related_files.map((f, idx) => (
                                    <span
                                        key={idx}
                                        style={{
                                            fontSize: '0.74rem',
                                            padding: '0.2rem 0.55rem',
                                            borderRadius: '6px',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        {f}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* =================================================================== */}
            {/* TAB 3: SIMULADOR HOLDING & REESTRUCTURACIÓN $10M (+ GRANJA/ANDELSA) */}
            {/* =================================================================== */}
            {activeTab === 'simulador' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <Calculator size={17} style={{ color: 'var(--primary)' }} />
                                    Modelador Financiero: Consolidación Deuda + CapEx Granja + Escudos Holding
                                </h3>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Evalúa el reemplazo de préstamos actuales ($5M) + nuevo financiamiento agroindustrial ($5M = $10M total) con período de gracia y escudos fiscales legales.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => handleRunSimulation(false)}
                                    disabled={runningSim}
                                    className="btn btn-primary"
                                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <Calculator size={14} />
                                    Calcular Escenario
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleRunSimulation(true)}
                                    disabled={runningSim}
                                    className="btn btn-secondary"
                                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <Save size={14} />
                                    Guardar en Memoria IA
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveTab('consola');
                                        handleSendMessage(
                                            null,
                                            `Analiza a fondo mi escenario simulado de $${((Number(simForm.deuda_actual_usd) + Number(simForm.capex_granja_usd)) / 1000000).toFixed(1)}M al ${simForm.nueva_tasa_pct}% por ${simForm.nuevo_plazo_meses} meses con ${simForm.meses_gracia_granja} meses de gracia y dime cómo presentarlo al comité bancario.`,
                                            'consultoria_financiera'
                                        );
                                    }}
                                    className="btn btn-secondary"
                                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <Sparkles size={14} />
                                    Debatir con IA
                                </button>
                            </div>
                        </div>

                        <div className="form-grid form-grid-3" style={{ gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Deuda Actual a Cancelar ($)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.deuda_actual_usd} onChange={(e) => setSimForm({ ...simForm, deuda_actual_usd: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Tasa Ponderada Actual (%)</label>
                                <input type="number" step="0.05" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.tasa_actual_pct} onChange={(e) => setSimForm({ ...simForm, tasa_actual_pct: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Plazo Restante Actual (Meses)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.plazo_actual_meses} onChange={(e) => setSimForm({ ...simForm, plazo_actual_meses: Number(e.target.value) })} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>CapEx Nueva Granja Avícola ($)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.capex_granja_usd} onChange={(e) => setSimForm({ ...simForm, capex_granja_usd: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Nueva Tasa Estructurada (%)</label>
                                <input type="number" step="0.05" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.nueva_tasa_pct} onChange={(e) => setSimForm({ ...simForm, nueva_tasa_pct: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Nuevo Plazo Total (Meses)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.nuevo_plazo_meses} onChange={(e) => setSimForm({ ...simForm, nuevo_plazo_meses: Number(e.target.value) })} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Gracia Capital Granja (Meses)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.meses_gracia_granja} onChange={(e) => setSimForm({ ...simForm, meses_gracia_granja: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>EBITDA Grupo Actual ($/Año)</label>
                                <input type="number" className="input-field" style={{ height: '36px', fontSize: '0.825rem' }} value={simForm.ebitda_actual_anual_usd} onChange={(e) => setSimForm({ ...simForm, ebitda_actual_anual_usd: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>EBITDA Granja + Sinergia Andelsa ($/Año)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    style={{ height: '36px', fontSize: '0.825rem' }}
                                    value={Number(simForm.ebitda_granja_anual_usd) + Number(simForm.sinergia_andelsa_anual_usd)}
                                    onChange={(e) => setSimForm({ ...simForm, ebitda_granja_anual_usd: Number(e.target.value), sinergia_andelsa_anual_usd: 0 })}
                                />
                            </div>
                        </div>
                    </div>

                    {simResults && (
                        <div className="card glass table-responsive" style={{ padding: 0 }}>
                            <table style={{ width: '100%', minWidth: '840px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(148, 163, 184, 0.06)' }}>
                                        <th style={{ padding: '0.45rem 0.6rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left' }}>Métrica Financiera y Fiscal</th>
                                        <th style={{ padding: '0.45rem 0.6rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Situación Actual</th>
                                        <th style={{ padding: '0.45rem 0.6rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Etapa Gracia ({simForm.meses_gracia_granja}m)</th>
                                        <th style={{ padding: '0.45rem 0.6rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Estabilizado ($10M + Granja)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Deuda Consolidada Total</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>{formatUSD(simForm.deuda_actual_usd, 0)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }}>{formatUSD(Number(simForm.deuda_actual_usd) + Number(simForm.capex_granja_usd), 0)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 700 }}>{formatUSD(Number(simForm.deuda_actual_usd) + Number(simForm.capex_granja_usd), 0)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Cuota Bancaria Mensual</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{formatUSD(simResults.cuota_mensual_actual_usd)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{formatUSD(simResults.cuota_total_durante_gracia_usd)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 700 }}>{formatUSD(simResults.cuota_total_estabilizada_usd)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>EBITDA Operativo Anual de Respaldo</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>{formatUSD(simForm.ebitda_actual_anual_usd, 0)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>{formatUSD(simForm.ebitda_actual_anual_usd, 0)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{formatUSD(simResults.ebitda_consolidado_estabilizado_usd, 0)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Índice Cobertura de Deuda (DSCR)</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>{simResults.dscr_actual}x</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }}>{simResults.dscr_durante_gracia}x</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>
                                            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: simResults.dscr_estabilizado >= 1.35 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)', color: simResults.dscr_estabilizado >= 1.35 ? '#10b981' : '#d97706', fontWeight: 700 }}>
                                                {simResults.dscr_estabilizado}x — {simResults.viabilidad}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Escudo Fiscal Anual (Intereses + TechCo Decreto 741 + Deprec.)</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>—</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{formatUSD(simResults.ahorro_fiscal_total_anual_usd)}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>{formatUSD(simResults.ahorro_fiscal_total_anual_usd)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontWeight: 700 }}>Flujo Neto Libre Anual (Post-Servicio de Deuda + Escudo Fiscal)</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right' }}>{formatUSD(Number(simForm.ebitda_actual_anual_usd) - Number(simResults.servicio_anual_actual_usd))}</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', textAlign: 'right', color: 'var(--text-muted)' }}>Construcción / Levante</td>
                                        <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem', textAlign: 'right', color: '#10b981', fontWeight: 800 }}>{formatUSD(simResults.flujo_libre_anual_post_deuda_usd)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Compartido: Crear / Editar Regla o Conocimiento */}
            <Modal
                open={kbModalOpen}
                onClose={() => setKbModalOpen(false)}
                title={editingKb ? 'Editar Conocimiento Estratégico' : 'Nuevo Conocimiento / Regla Corporativa'}
                size="lg"
            >
                <form onSubmit={handleSaveKb} className="form-grid form-grid-2" style={{ gap: '0.85rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Categoría</label>
                        <select
                            className="input-field"
                            value={kbForm.categoria}
                            onChange={(e) => setKbForm({ ...kbForm, categoria: e.target.value })}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                        >
                            {categorias.map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Etiquetas (separadas por coma)</label>
                        <input
                            type="text"
                            className="input-field"
                            value={kbForm.etiquetas}
                            onChange={(e) => setKbForm({ ...kbForm, etiquetas: e.target.value })}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                            placeholder="holding,decreto-741,dscr,granja"
                        />
                    </div>

                    <div className="span-2">
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Título del Conocimiento o Regla *</label>
                        <input
                            type="text"
                            required
                            className="input-field"
                            value={kbForm.titulo}
                            onChange={(e) => setKbForm({ ...kbForm, titulo: e.target.value })}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                            placeholder="Ej: Meta de tasa máxima para sindicado $10M"
                        />
                    </div>

                    <div className="span-2">
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Resumen Ejecutivo (1 línea)</label>
                        <input
                            type="text"
                            className="input-field"
                            value={kbForm.resumen_ejecutivo}
                            onChange={(e) => setKbForm({ ...kbForm, resumen_ejecutivo: e.target.value })}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                            placeholder="Síntesis rápida visible en el listado y reportes PDF"
                        />
                    </div>

                    <div className="span-2">
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Contenido Detallado para Memoria de IA y AGY *</label>
                        <textarea
                            required
                            rows={5}
                            className="input-field"
                            value={kbForm.contenido}
                            onChange={(e) => setKbForm({ ...kbForm, contenido: e.target.value })}
                            style={{ fontSize: '0.825rem', padding: '0.6rem' }}
                            placeholder="Describe la directriz financiera, acuerdo societario, estructura fiscal o regla de negocio..."
                        />
                    </div>

                    <div className="span-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={kbForm.fijado}
                                onChange={(e) => setKbForm({ ...kbForm, fijado: e.target.checked })}
                                style={{ width: '16px', height: '16px' }}
                            />
                            Fijar permanentemente en el contexto de Consultoría y Consola AGY
                        </label>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" onClick={() => setKbModalOpen(false)} className="btn btn-secondary" style={{ height: '36px' }}>
                                Cancelar
                            </button>
                            <button type="submit" className="btn btn-primary" style={{ height: '36px' }}>
                                Guardar Conocimiento
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>

            {/* Modal Compartido: Solicitar Planificación de Modificación en Consola AGY */}
            <Modal
                open={planModalOpen}
                onClose={() => setPlanModalOpen(false)}
                title="Planificar Modificación con AGY en el Servidor"
                size="lg"
            >
                <form onSubmit={handleGenerateAgyPlan} className="form-grid form-grid-2" style={{ gap: '0.85rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Repositorio en Servidor</label>
                        <select
                            className="input-field"
                            value={targetProject}
                            onChange={(e) => setTargetProject(e.target.value)}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                        >
                            <option value="sipeadmin">admin.sipesv.com (SIPE Admin)</option>
                            <option value="sipesaas">sys.sipesv.com (SIPE SaaS)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>Modelo Consola AGY</label>
                        <select
                            className="input-field"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            style={{ height: '38px', fontSize: '0.825rem' }}
                        >
                            <option value="gemini-4-argon-high">gemini-4-argon-high (Recomendado)</option>
                            <option value="gemini-3.1-pro">gemini-3.1-pro (Razonamiento Profundo)</option>
                            <option value="gemini-3-flash">gemini-3-flash (Ultra Rápido)</option>
                        </select>
                    </div>

                    <div className="span-2">
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                            Directriz o Modificación Solicitada a AGY *
                        </label>
                        <textarea
                            required
                            rows={5}
                            className="input-field"
                            value={planInstruction}
                            onChange={(e) => setPlanInstruction(e.target.value)}
                            style={{ fontSize: '0.825rem', padding: '0.6rem' }}
                            placeholder="Describe qué mejora, cálculo, reporte o ajuste deseas que AGY planifique sobre los archivos del servidor..."
                        />
                    </div>

                    <div className="span-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={syncWithTickets}
                                onChange={(e) => setSyncWithTickets(e.target.checked)}
                                style={{ width: '16px', height: '16px' }}
                            />
                            Sincronizar con Tickets (#ADM) y enviar botones de aprobación a Telegram
                        </label>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" onClick={() => setPlanModalOpen(false)} className="btn btn-secondary" style={{ height: '36px' }}>
                                Cancelar
                            </button>
                            <button type="submit" disabled={runningAgyAction} className="btn btn-primary" style={{ height: '36px' }}>
                                {runningAgyAction ? 'Planificando en Servidor...' : 'Generar Plan AGY'}
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>

            {/* Vista Previa PDF Tamaño Carta Obligatoria */}
            <ReportPreviewModal
                isOpen={pdfPreview.open}
                onClose={() => setPdfPreview({ ...pdfPreview, open: false })}
                title="Reporte Ejecutivo de Crecimiento Empresarial & Holding"
                subtitle={pdfPreview.subtitle}
                badge="ESTRATEGIA & AGY"
                pdfSource={pdfPreview.blob}
                fileName={`Crecimiento_Empresarial_SIPE_${new Date().toISOString().slice(0, 10)}.pdf`}
                totalPages={pdfPreview.totalPages}
            />
        </div>
    );
}
