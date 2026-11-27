import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    Search,
    CheckCircle2,
    Circle,
    ChevronRight,
    ChevronLeft,
    ExternalLink,
    Printer,
    RotateCcw,
    Clock,
    ShieldCheck,
    AlertTriangle,
    Lightbulb,
    Compass,
    Layers,
    ListChecks,
    PlayCircle,
    HelpCircle,
    Sparkles,
    Award,
    ArrowLeft,
    X,
    FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    TUTORIAL_CATEGORIES,
    ALL_TUTORIALS,
    DIFFICULTY_STYLES,
    getCategoryMeta
} from '../data/tutorials';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { getStoredUser } from '../utils/auth';
import { hasRoutePermission } from '../config/routeRegistry';
import { todayStr } from '../utils/date';

const QUICK_SCENARIOS = [
    { label: 'Abastecer Estación (Fin a Fin)', tutorialId: 'flujo-ciclo-combustible', color: '#8b5cf6' },
    { label: 'Conciliar Banco (Extracto y $0.00)', tutorialId: 'ban-conciliacion-bancaria', color: '#10b981' },
    { label: 'Cerrar Período / Reapertura', tutorialId: 'ban-periodos-auditoria', color: '#06b6d4' },
    { label: 'Registrar Pago con OCR IA', tutorialId: 'op-control-pagos', color: '#f59e0b' },
    { label: 'Imprimir Cheques en Lote', tutorialId: 'ban-impresion-cheques', color: '#3b82f6' },
    { label: 'Recibir Pipa en RRS', tutorialId: 'op-consulta-pedidos', color: '#ef4444' }
];

function getProgressStorageKey() {
    const user = getStoredUser();
    const uid = user?.id || user?.username || 'default';
    return `sipe_tutorials_progress_v1_${uid}`;
}

function loadSavedProgress() {
    try {
        const raw = localStorage.getItem(getProgressStorageKey());
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export default function CentroTutoriales() {
    const navigate = useNavigate();
    const { confirm } = useConfirm();
    const { addToast } = useToast();
    const user = getStoredUser();

    // Filters
    const [activeCategory, setActiveCategory] = useState('all');
    const [difficultyFilter, setDifficultyFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);

    // Active tutorial & view mode
    const [selectedTutorialId, setSelectedTutorialId] = useState(null);
    const [viewMode, setViewMode] = useState('full'); // 'full' | 'guided'
    const [guidedStepIndex, setGuidedStepIndex] = useState(0);

    // Checklist progress persisted in localStorage: { [tutorialId]: { steps: [0,1], checks: [0] } }
    const [progressMap, setProgressMap] = useState(() => loadSavedProgress());

    // PDF ReportPreviewModal state
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [pdfTotalPages, setPdfTotalPages] = useState(1);
    const [pdfTitle, setPdfTitle] = useState('Manual Operativo SIPE Admin');
    const [pdfSubtitle, setPdfSubtitle] = useState('');
    const [pdfBadge, setPdfBadge] = useState('MANUAL SOP');
    const [pdfFileName, setPdfFileName] = useState('Manual_SIPE.pdf');

    useEffect(() => {
        try {
            localStorage.setItem(getProgressStorageKey(), JSON.stringify(progressMap));
        } catch {
            // ignore storage quota errors
        }
    }, [progressMap]);

    const getTutorialStats = useCallback((tutorial) => {
        const entry = progressMap[tutorial.id] || { steps: [], checks: [] };
        const totalSteps = tutorial.steps.length;
        const doneSteps = (entry.steps || []).filter((idx) => idx >= 0 && idx < totalSteps).length;
        const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
        const isCompleted = totalSteps > 0 && doneSteps === totalSteps;
        return { doneSteps, totalSteps, pct, isCompleted, checkedSteps: entry.steps || [], checkedChecks: entry.checks || [] };
    }, [progressMap]);

    const globalStats = useMemo(() => {
        let totalSteps = 0;
        let completedSteps = 0;
        let completedTutorials = 0;
        ALL_TUTORIALS.forEach((tut) => {
            const st = getTutorialStats(tut);
            totalSteps += st.totalSteps;
            completedSteps += st.doneSteps;
            if (st.isCompleted) completedTutorials += 1;
        });
        const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        return {
            totalTutorials: ALL_TUTORIALS.length,
            completedTutorials,
            totalSteps,
            completedSteps,
            pct
        };
    }, [getTutorialStats]);

    const categoryCounts = useMemo(() => {
        const counts = { all: ALL_TUTORIALS.length };
        ALL_TUTORIALS.forEach((t) => {
            counts[t.category] = (counts[t.category] || 0) + 1;
        });
        return counts;
    }, []);

    const filteredTutorials = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return ALL_TUTORIALS.filter((tut) => {
            if (activeCategory !== 'all' && tut.category !== activeCategory) return false;
            if (difficultyFilter !== 'ALL' && tut.difficulty !== difficultyFilter) return false;
            if (onlyPending && getTutorialStats(tut).isCompleted) return false;

            if (!q) return true;
            const hay = [
                tut.title,
                tut.subtitle,
                tut.objective,
                tut.role,
                tut.routeLabel,
                ...(tut.tags || []),
                ...(tut.flowSteps || []),
                ...tut.steps.flatMap((s) => [s.title, s.location, s.summary, ...(s.instructions || []), s.verify, s.tip, s.warning]),
                ...(tut.troubleshooting || []).flatMap((tr) => [tr.symptom, tr.cause, tr.solution])
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return q.split(/\s+/).every((word) => hay.includes(word));
        });
    }, [activeCategory, difficultyFilter, searchQuery, onlyPending, getTutorialStats]);

    const selectedTutorial = useMemo(
        () => ALL_TUTORIALS.find((t) => t.id === selectedTutorialId) || null,
        [selectedTutorialId]
    );

    const openTutorial = (tutorialId, mode = 'full') => {
        const tut = ALL_TUTORIALS.find((t) => t.id === tutorialId);
        if (!tut) return;
        setSelectedTutorialId(tutorialId);
        setViewMode(mode);
        // En modo guiado, abrir en el primer paso pendiente (o paso 0 si ya está completo)
        const st = getTutorialStats(tut);
        const firstIncomplete = tut.steps.findIndex((_, idx) => !st.checkedSteps.includes(idx));
        setGuidedStepIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
    };

    const toggleStepDone = (tutorialId, stepIdx, forceValue = null) => {
        setProgressMap((prev) => {
            const current = prev[tutorialId] || { steps: [], checks: [] };
            const exists = current.steps.includes(stepIdx);
            const nextVal = forceValue !== null ? forceValue : !exists;
            const nextSteps = nextVal
                ? Array.from(new Set([...current.steps, stepIdx])).sort((a, b) => a - b)
                : current.steps.filter((i) => i !== stepIdx);
            return {
                ...prev,
                [tutorialId]: { ...current, steps: nextSteps }
            };
        });
    };

    const toggleChecklistItem = (tutorialId, checkIdx) => {
        setProgressMap((prev) => {
            const current = prev[tutorialId] || { steps: [], checks: [] };
            const exists = current.checks.includes(checkIdx);
            const nextChecks = exists
                ? current.checks.filter((i) => i !== checkIdx)
                : [...current.checks, checkIdx].sort((a, b) => a - b);
            return {
                ...prev,
                [tutorialId]: { ...current, checks: nextChecks }
            };
        });
    };

    const handleResetTutorialProgress = async (tutorial) => {
        const ok = await confirm(
            `¿Reiniciar el checklist de pasos completados para "${tutorial.title}"?`,
            { variant: 'danger', title: 'Reiniciar avance de guía' }
        );
        if (!ok) return;
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[tutorial.id];
            return next;
        });
        setGuidedStepIndex(0);
        addToast('Avance del tutorial reiniciado', 'success');
    };

    const handleResetAllProgress = async () => {
        if (globalStats.completedSteps === 0) {
            addToast('Aún no hay pasos marcados para reiniciar', 'info');
            return;
        }
        const ok = await confirm(
            '¿Deseas reiniciar todo tu progreso guardado en el Centro de Tutoriales? Esta acción limpiará todos los pasos marcados.',
            { variant: 'danger', title: 'Reiniciar todo el progreso' }
        );
        if (!ok) return;
        setProgressMap({});
        setGuidedStepIndex(0);
        addToast('Progreso global reiniciado correctamente', 'success');
    };

    const handleGoToModule = (route, label) => {
        if (!route) return;
        if (!hasRoutePermission(user, route)) {
            addToast(`Tu rol actual no tiene permiso para abrir "${label || route}". Solicita acceso en Seguridad → Permisos.`, 'warning');
            return;
        }
        navigate(route);
    };

    // ────────────────── Generación de PDF Carta (ReportPreviewModal) ──────────────────
    const renderTutorialIntoPdf = (doc, tutorial, isFirstPage = true) => {
        if (!isFirstPage) doc.addPage();

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        const maxWidth = pageWidth - margin * 2;
        const catMeta = getCategoryMeta(tutorial.category);

        // Banda superior institucional
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 26, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('SIPE ADMIN · PROCEDIMIENTO OPERATIVO PASO A PASO', margin, 10.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(203, 213, 225);
        doc.text(
            `Categoría: ${catMeta.label}   |   Nivel: ${tutorial.difficulty}   |   Duración est.: ${tutorial.duration}   |   Módulo: ${tutorial.routeLabel}`,
            margin,
            17.5
        );
        doc.text(`Rol sugerido: ${tutorial.role}`, margin, 22.5);

        let y = 34;

        // Título y objetivo
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        const titleLines = doc.splitTextToSize(tutorial.title, maxWidth);
        doc.text(titleLines, margin, y);
        y += titleLines.length * 5.8 + 2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        const objLines = doc.splitTextToSize(`Objetivo: ${tutorial.objective}`, maxWidth);
        doc.text(objLines, margin, y);
        y += objLines.length * 4.5 + 3;

        // Mapa de flujo
        if (tutorial.flowSteps?.length) {
            doc.setFillColor(241, 245, 249);
            const flowText = `Flujo Operativo: ${tutorial.flowSteps.join('  ->  ')}`;
            const flowLines = doc.splitTextToSize(flowText, maxWidth - 6);
            const boxH = flowLines.length * 4.2 + 5;
            doc.roundedRect(margin, y, maxWidth, boxH, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(37, 99, 235);
            doc.text(flowLines, margin + 3, y + 4.5);
            y += boxH + 4;
        }

        // Tabla de pasos detallados
        const stepsRows = tutorial.steps.map((s, idx) => {
            const detailParts = [
                `Ubicación: ${s.location}`,
                '',
                ...(s.instructions || []).map((ins, i) => `${i + 1}. ${ins}`),
                '',
                `Validar: ${s.verify}`
            ];
            if (s.tip) detailParts.push(`Consejo: ${s.tip}`);
            if (s.warning) detailParts.push(`ALERTA: ${s.warning}`);
            return [`Paso ${idx + 1}\n[  ]`, `${s.title}\n\n${detailParts.join('\n')}`];
        });

        autoTable(doc, {
            startY: y,
            head: [['Paso', 'Instrucciones Detalladas y Criterio de Verificación']],
            body: stepsRows,
            theme: 'grid',
            styles: {
                fontSize: 8,
                cellPadding: 2.8,
                textColor: [30, 41, 59],
                overflow: 'linebreak',
                valign: 'top'
            },
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5
            },
            columnStyles: {
                0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 'auto' }
            },
            margin: { left: margin, right: margin, bottom: 18 }
        });

        y = (doc.lastAutoTable?.finalY || y) + 5;

        // Criterios de Operación Exitosa
        if (tutorial.successChecklist?.length) {
            autoTable(doc, {
                startY: y,
                head: [['OK', 'Lista de Verificación Final · Operación Exitosa']],
                body: tutorial.successChecklist.map((c) => ['[  ]', c]),
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2.2, textColor: [30, 41, 59] },
                headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' } },
                margin: { left: margin, right: margin, bottom: 18 }
            });
            y = (doc.lastAutoTable?.finalY || y) + 5;
        }

        // Resolución de Problemas
        if (tutorial.troubleshooting?.length) {
            autoTable(doc, {
                startY: y,
                head: [['Problema / Síntoma', 'Causa Probable', 'Solución Paso a Paso']],
                body: tutorial.troubleshooting.map((tr) => [tr.symptom, tr.cause, tr.solution]),
                theme: 'grid',
                styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59] },
                headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: 'bold' },
                margin: { left: margin, right: margin, bottom: 18 }
            });
        }
    };

    const finalizeAndPreviewPdf = (doc, title, subtitle, badge, fileName) => {
        const totalPages = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('SIPE Admin · Centro de Tutoriales Oficial (Tamaño Carta)', 14, pageHeight - 8);
            doc.text(`Página ${i} de ${totalPages}  |  Emitido: ${todayStr()}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
        }

        setPdfBlob(doc.output('blob'));
        setPdfTotalPages(totalPages);
        setPdfTitle(title);
        setPdfSubtitle(subtitle);
        setPdfBadge(badge);
        setPdfFileName(fileName);
        setShowPdfPreview(true);
    };

    const handlePreviewSingleTutorialPdf = (tutorial) => {
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            renderTutorialIntoPdf(doc, tutorial, true);
            const cleanName = tutorial.id.replace(/[^a-zA-Z0-9_-]/g, '_');
            finalizeAndPreviewPdf(
                doc,
                tutorial.title,
                `${getCategoryMeta(tutorial.category).label} · ${tutorial.steps.length} pasos detallados`,
                tutorial.difficulty.toUpperCase(),
                `Guia_${cleanName}_${todayStr()}.pdf`
            );
        } catch (err) {
            addToast('Error al generar la vista previa PDF del tutorial', 'error');
        }
    };

    const handlePreviewCategoryManualPdf = () => {
        const list = filteredTutorials.length > 0 ? filteredTutorials : ALL_TUTORIALS;
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            list.forEach((tut, idx) => renderTutorialIntoPdf(doc, tut, idx === 0));
            const catMeta = getCategoryMeta(activeCategory);
            finalizeAndPreviewPdf(
                doc,
                `Manual Operativo · ${catMeta.label}`,
                `${list.length} guías paso a paso incluidas · Formato Carta`,
                catMeta.shortLabel.toUpperCase(),
                `Manual_SIPE_${activeCategory}_${todayStr()}.pdf`
            );
        } catch (err) {
            addToast('Error al generar el manual PDF', 'error');
        }
    };

    // ────────────────── Render Vista Detalle / Modo Guiado ──────────────────
    const renderTutorialDetail = (tutorial) => {
        const catMeta = getCategoryMeta(tutorial.category);
        const diffStyle = DIFFICULTY_STYLES[tutorial.difficulty] || DIFFICULTY_STYLES.Esencial;
        const stats = getTutorialStats(tutorial);
        const currentGuidedStep = tutorial.steps[guidedStepIndex] || tutorial.steps[0];
        const isCurrentStepDone = stats.checkedSteps.includes(guidedStepIndex);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Barra superior de navegación del detalle */}
                <div className="page-header" style={{ marginBottom: '0.25rem', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setSelectedTutorialId(null)}
                            style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <ArrowLeft size={15} />
                            <span>Volver al Catálogo</span>
                        </button>
                        <span
                            className="badge"
                            style={{
                                background: `${catMeta.color}22`,
                                color: catMeta.color,
                                border: `1px solid ${catMeta.color}55`,
                                fontSize: '0.72rem',
                                padding: '0.2rem 0.55rem'
                            }}
                        >
                            {catMeta.shortLabel}
                        </span>
                        <span
                            className="badge"
                            style={{
                                background: diffStyle.bg,
                                color: diffStyle.color,
                                border: `1px solid ${diffStyle.border}`,
                                fontSize: '0.72rem',
                                padding: '0.2rem 0.55rem'
                            }}
                        >
                            {tutorial.difficulty}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <Clock size={14} /> {tutorial.duration}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {tutorial.route && (
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => handleGoToModule(tutorial.route, tutorial.routeLabel)}
                                style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                title="Abre la pantalla real en otra pestaña manteniendo este tutorial abierto"
                            >
                                <ExternalLink size={14} />
                                <span>Ir a {tutorial.routeLabel}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handlePreviewSingleTutorialPdf(tutorial)}
                            style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            title="Previsualizar e imprimir esta guía en PDF tamaño Carta"
                        >
                            <Printer size={14} />
                            <span>PDF / Imprimir</span>
                        </button>
                        {stats.doneSteps > 0 && (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleResetTutorialProgress(tutorial)}
                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)' }}
                                title="Reiniciar pasos marcados"
                            >
                                <RotateCcw size={14} />
                                <span>Reiniciar</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Encabezado del Tutorial + Barra de Progreso + Switcher Modo */}
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 320px' }}>
                            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>{tutorial.title}</h1>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.3rem 0 0 0' }}>{tutorial.objective}</p>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                <strong>Perfil recomendado:</strong> {tutorial.role}
                            </div>
                        </div>

                        {/* Switcher Vista Completa vs Modo Guiado */}
                        <div style={{ display: 'inline-flex', padding: '3px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', gap: '3px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setViewMode('full')}
                                style={{
                                    height: '32px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    background: viewMode === 'full' ? 'var(--primary)' : 'transparent',
                                    color: viewMode === 'full' ? '#fff' : 'var(--text-muted)'
                                }}
                            >
                                <ListChecks size={14} />
                                <span>Manual Completo</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('guided')}
                                style={{
                                    height: '32px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    background: viewMode === 'guided' ? 'var(--primary)' : 'transparent',
                                    color: viewMode === 'guided' ? '#fff' : 'var(--text-muted)'
                                }}
                            >
                                <PlayCircle size={14} />
                                <span>Modo Guiado Paso a Paso</span>
                            </button>
                        </div>
                    </div>

                    {/* Barra de progreso */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', marginBottom: '0.3rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: stats.isCompleted ? '#10b981' : 'var(--text)' }}>
                                {stats.isCompleted ? 'Operación dominada · Todos los pasos verificados' : `Progreso interactivo: ${stats.doneSteps} de ${stats.totalSteps} pasos completados`}
                            </span>
                            <span style={{ fontWeight: 700, color: stats.isCompleted ? '#10b981' : 'var(--primary)' }}>{stats.pct}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <div
                                style={{
                                    width: `${stats.pct}%`,
                                    height: '100%',
                                    background: stats.isCompleted ? '#10b981' : 'var(--primary)',
                                    transition: 'width 0.25s ease'
                                }}
                            />
                        </div>
                    </div>

                    {/* Mapa visual de flujo */}
                    {tutorial.flowSteps?.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: '0.25rem' }}>
                                Ruta de Éxito:
                            </span>
                            {tutorial.flowSteps.map((fs, i) => (
                                <React.Fragment key={i}>
                                    <span
                                        style={{
                                            fontSize: '0.74rem',
                                            fontWeight: 600,
                                            padding: '0.2rem 0.55rem',
                                            borderRadius: '6px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text)'
                                        }}
                                    >
                                        {fs}
                                    </span>
                                    {i < tutorial.flowSteps.length - 1 && (
                                        <ChevronRight size={14} color="var(--text-muted)" />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>

                {/* Prerrequisitos */}
                {tutorial.prerequisites?.length > 0 && (
                    <div className="card glass" style={{ padding: '0.85rem 1.15rem', borderLeft: '3px solid var(--primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.45rem', color: 'var(--primary)' }}>
                            <ShieldCheck size={16} />
                            <span>Prerrequisitos antes de comenzar</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {tutorial.prerequisites.map((pre, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                    <span>• {pre.label}</span>
                                    {pre.route && (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => handleGoToModule(pre.route, pre.routeLabel)}
                                            style={{ padding: '0.18rem 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                        >
                                            <ExternalLink size={12} />
                                            <span>{pre.routeLabel}</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* MODO GUIADO PASO A PASO */}
                {viewMode === 'guided' && currentGuidedStep && (
                    <div className="card glass" style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', border: '1px solid var(--primary)' }}>
                        {/* Selector rápido de pasos */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {tutorial.steps.map((s, idx) => {
                                const done = stats.checkedSteps.includes(idx);
                                const active = idx === guidedStepIndex;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setGuidedStepIndex(idx)}
                                        style={{
                                            height: '30px',
                                            padding: '0 0.65rem',
                                            borderRadius: '999px',
                                            fontSize: '0.74rem',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                            background: active ? 'var(--primary)' : (done ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-secondary)'),
                                            color: active ? '#fff' : (done ? '#10b981' : 'var(--text-muted)')
                                        }}
                                    >
                                        {done && !active ? <CheckCircle2 size={13} /> : null}
                                        <span>Paso {idx + 1}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                                    Paso {guidedStepIndex + 1} de {tutorial.steps.length} · {currentGuidedStep.location}
                                </div>
                                <h2 style={{ fontSize: '1.08rem', fontWeight: 700, margin: '0.2rem 0 0 0' }}>{currentGuidedStep.title}</h2>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>{currentGuidedStep.summary}</p>
                            </div>
                            {(currentGuidedStep.route || tutorial.route) && (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleGoToModule(currentGuidedStep.route || tutorial.route, currentGuidedStep.routeLabel || tutorial.routeLabel)}
                                    style={{ height: '34px', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <ExternalLink size={13} />
                                    <span>{currentGuidedStep.routeLabel || `Abrir ${tutorial.routeLabel}`}</span>
                                </button>
                            )}
                        </div>

                        <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.84rem', lineHeight: 1.55 }}>
                            {currentGuidedStep.instructions.map((ins, i) => (
                                <li key={i}>{ins}</li>
                            ))}
                        </ol>

                        {/* Caja de verificación */}
                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', fontSize: '0.8rem' }}>
                            <strong style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckCircle2 size={14} /> Qué validar antes de avanzar:
                            </strong>{' '}
                            <span>{currentGuidedStep.verify}</span>
                        </div>

                        {currentGuidedStep.tip && (
                            <div style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.8rem' }}>
                                <strong style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Lightbulb size={14} /> Consejo Pro:
                                </strong>{' '}
                                <span>{currentGuidedStep.tip}</span>
                            </div>
                        )}

                        {currentGuidedStep.warning && (
                            <div style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', fontSize: '0.8rem' }}>
                                <strong style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <AlertTriangle size={14} /> Precaución importante:
                                </strong>{' '}
                                <span>{currentGuidedStep.warning}</span>
                            </div>
                        )}

                        {/* Controles del asistente */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={guidedStepIndex === 0}
                                onClick={() => setGuidedStepIndex((i) => Math.max(0, i - 1))}
                                style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', opacity: guidedStepIndex === 0 ? 0.5 : 1 }}
                            >
                                <ChevronLeft size={15} />
                                <span>Paso Anterior</span>
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={isCurrentStepDone}
                                        onChange={() => toggleStepDone(tutorial.id, guidedStepIndex)}
                                    />
                                    <span>Paso verificado</span>
                                </label>

                                {guidedStepIndex < tutorial.steps.length - 1 ? (
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => {
                                            toggleStepDone(tutorial.id, guidedStepIndex, true);
                                            setGuidedStepIndex((i) => Math.min(tutorial.steps.length - 1, i + 1));
                                        }}
                                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <span>Completar y Siguiente</span>
                                        <ChevronRight size={15} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => {
                                            toggleStepDone(tutorial.id, guidedStepIndex, true);
                                            addToast(`¡Excelente! Completaste todos los pasos de "${tutorial.title}"`, 'success');
                                            setViewMode('full');
                                        }}
                                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', background: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <Award size={15} />
                                        <span>Finalizar Guía</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* VISTA COMPLETA: TODOS LOS PASOS */}
                {viewMode === 'full' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {tutorial.steps.map((step, idx) => {
                            const done = stats.checkedSteps.includes(idx);
                            return (
                                <div
                                    key={idx}
                                    className="card glass"
                                    style={{
                                        padding: '0.95rem 1.15rem',
                                        borderLeft: `4px solid ${done ? '#10b981' : catMeta.color}`,
                                        opacity: done ? 0.94 : 1
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', flex: '1 1 260px' }}>
                                            <button
                                                type="button"
                                                onClick={() => toggleStepDone(tutorial.id, idx)}
                                                title={done ? 'Marcar paso como pendiente' : 'Marcar paso como completado'}
                                                style={{
                                                    padding: 0,
                                                    background: 'none',
                                                    border: 'none',
                                                    color: done ? '#10b981' : 'var(--text-muted)',
                                                    marginTop: '2px',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                            </button>
                                            <div>
                                                <div style={{ fontSize: '0.71rem', fontWeight: 700, color: done ? '#10b981' : 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                    Paso {idx + 1} · {step.location}
                                                </div>
                                                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, margin: '0.15rem 0 0 0', textDecoration: done ? 'line-through' : 'none' }}>
                                                    {step.title}
                                                </h3>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                                                    {step.summary}
                                                </p>
                                            </div>
                                        </div>

                                        {step.route && (
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => handleGoToModule(step.route, step.routeLabel)}
                                                style={{ height: '32px', padding: '0 0.7rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            >
                                                <ExternalLink size={12} />
                                                <span>{step.routeLabel || 'Abrir pantalla'}</span>
                                            </button>
                                        )}
                                    </div>

                                    <ol style={{ paddingLeft: '2.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.81rem', lineHeight: 1.5, marginBottom: '0.65rem' }}>
                                        {step.instructions.map((ins, i) => (
                                            <li key={i}>{ins}</li>
                                        ))}
                                    </ol>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingLeft: '0.25rem' }}>
                                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.09)', border: '1px solid rgba(16, 185, 129, 0.28)', fontSize: '0.78rem' }}>
                                            <strong style={{ color: '#10b981' }}>Qué validar:</strong> {step.verify}
                                        </div>
                                        {step.tip && (
                                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.09)', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: '0.78rem' }}>
                                                <strong style={{ color: 'var(--primary)' }}>Consejo Pro:</strong> {step.tip}
                                            </div>
                                        )}
                                        {step.warning && (
                                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.09)', border: '1px solid rgba(239, 68, 68, 0.28)', fontSize: '0.78rem' }}>
                                                <strong style={{ color: 'var(--danger)' }}>Alerta / Error común:</strong> {step.warning}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Lista de Verificación Final ("Operación Exitosa") */}
                {tutorial.successChecklist?.length > 0 && (
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                            <Award size={18} color="#10b981" />
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Criterios de Operación Exitosa (Verificación Final)</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {tutorial.successChecklist.map((item, idx) => {
                                const checked = stats.checkedChecks.includes(idx);
                                return (
                                    <label
                                        key={idx}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            color: checked ? '#10b981' : 'var(--text)'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleChecklistItem(tutorial.id, idx)}
                                        />
                                        <span style={{ textDecoration: checked ? 'line-through' : 'none' }}>{item}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Resolución de Problemas Frecuentes */}
                {tutorial.troubleshooting?.length > 0 && (
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                            <HelpCircle size={18} color="#f59e0b" />
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Resolución de Problemas Frecuentes</h3>
                        </div>
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', marginTop: 0 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', width: '30%' }}>Síntoma / Mensaje</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', width: '30%' }}>Causa Probable</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', width: '40%' }}>Solución Exacta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tutorial.troubleshooting.map((tr, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger)' }}>{tr.symptom}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tr.cause}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text)' }}>{tr.solution}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ────────────────── Render Principal (Catálogo o Detalle) ──────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {selectedTutorial ? (
                renderTutorialDetail(selectedTutorial)
            ) : (
                <>
                    {/* Page Header Compacto */}
                    <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.14)', color: 'var(--primary)', display: 'flex' }}>
                                <BookOpen size={22} />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Centro de Tutoriales · Operaciones y Bancos</h1>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Guías detalladas paso a paso, checklists interactivos y flujos maestros para una operación exitosa en SIPE Admin
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handlePreviewCategoryManualPdf}
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                title="Generar manual imprimible tamaño Carta de las guías filtradas"
                            >
                                <Printer size={15} />
                                <span>Manual PDF ({filteredTutorials.length})</span>
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleResetAllProgress}
                                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                title="Reiniciar todo mi progreso personal"
                            >
                                <RotateCcw size={14} />
                                <span>Reiniciar Avance</span>
                            </button>
                        </div>
                    </div>

                    {/* KPIs de Progreso y Cobertura */}
                    <div className="tutorials-kpi-grid">
                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary)' }}>
                                <Layers size={19} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Guías Disponibles</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{globalStats.totalTutorials} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>manuales</span></div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                                <Compass size={19} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Operaciones & Flujos</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f59e0b' }}>
                                    {(categoryCounts.operaciones || 0) + (categoryCounts.flujos || 0)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>guías</span>
                                </div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                <FileText size={19} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Bancos & Cheques</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>
                                    {categoryCounts.bancos || 0} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>guías</span>
                                </div>
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>
                                <span>Mi Avance ({globalStats.completedSteps}/{globalStats.totalSteps} pasos)</span>
                                <span style={{ color: 'var(--primary)' }}>{globalStats.pct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '7px', background: 'var(--bg-secondary)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ width: `${globalStats.pct}%`, height: '100%', background: globalStats.pct === 100 ? '#10b981' : 'var(--primary)', transition: 'width 0.25s ease' }} />
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {globalStats.completedTutorials} de {globalStats.totalTutorials} guías completadas
                            </div>
                        </div>
                    </div>

                    {/* Accesos Rápidos ("¿Qué operación vas a realizar hoy?") */}
                    <div className="card glass" style={{ padding: '0.85rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            <Sparkles size={14} color="var(--primary)" />
                            <span>Inicio Rápido · Abrir Asistente Paso a Paso para Operaciones Clave:</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            {QUICK_SCENARIOS.map((sc) => (
                                <button
                                    key={sc.tutorialId}
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => openTutorial(sc.tutorialId, 'guided')}
                                    style={{
                                        height: '32px',
                                        padding: '0 0.7rem',
                                        fontSize: '0.76rem',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        borderColor: `${sc.color}55`
                                    }}
                                >
                                    <PlayCircle size={13} color={sc.color} />
                                    <span>{sc.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Barra de Categorías y Filtros Compactos */}
                    <div className="card glass" style={{ padding: '0.9rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Tabs de Categoría */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {TUTORIAL_CATEGORIES.map((cat) => {
                                const isActive = activeCategory === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setActiveCategory(cat.id)}
                                        style={{
                                            height: '34px',
                                            padding: '0 0.85rem',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            border: isActive ? `1px solid ${cat.color}` : '1px solid var(--border)',
                                            background: isActive ? cat.color : 'var(--bg-secondary)',
                                            color: isActive ? '#ffffff' : 'var(--text)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}
                                    >
                                        <span>{cat.shortLabel}</span>
                                        <span
                                            style={{
                                                fontSize: '0.7rem',
                                                padding: '0.05rem 0.4rem',
                                                borderRadius: '999px',
                                                background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--card-bg)',
                                                color: isActive ? '#fff' : 'var(--text-muted)'
                                            }}
                                        >
                                            {categoryCounts[cat.id] || 0}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Fila de Búsqueda + Nivel + Solo pendientes */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: '1 1 240px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar por módulo, botón o problema (ej. periodo cerrado, reapertura, extracto excel, multiparada, OCR, saldo inicial, candado)..."
                                    style={{ height: '36px', fontSize: '0.825rem', paddingLeft: '32px', paddingRight: searchQuery ? '30px' : '0.75rem' }}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', padding: '0.2rem' }}
                                        title="Limpiar búsqueda"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <select
                                value={difficultyFilter}
                                onChange={(e) => setDifficultyFilter(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: '150px', padding: '0 0.6rem' }}
                                title="Filtrar por nivel"
                            >
                                <option value="ALL">Todos los niveles</option>
                                <option value="Esencial">Esencial</option>
                                <option value="Intermedio">Intermedio</option>
                                <option value="Avanzado">Avanzado</option>
                            </select>

                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={onlyPending}
                                    onChange={(e) => setOnlyPending(e.target.checked)}
                                />
                                <span>Solo pendientes</span>
                            </label>

                            {(searchQuery || difficultyFilter !== 'ALL' || onlyPending || activeCategory !== 'all') && (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setDifficultyFilter('ALL');
                                        setOnlyPending(false);
                                        setActiveCategory('all');
                                    }}
                                    style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    <X size={14} />
                                    <span>Limpiar</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Grid de Tarjetas de Tutoriales */}
                    {filteredTutorials.length === 0 ? (
                        <div className="card glass" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>No se encontraron tutoriales con esos filtros</div>
                            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Prueba con otra palabra clave o limpia los filtros para ver las {ALL_TUTORIALS.length} guías completas.</p>
                        </div>
                    ) : (
                        <div className="tutorials-grid">
                            {filteredTutorials.map((tut) => {
                                const catMeta = getCategoryMeta(tut.category);
                                const diffStyle = DIFFICULTY_STYLES[tut.difficulty] || DIFFICULTY_STYLES.Esencial;
                                const st = getTutorialStats(tut);

                                return (
                                    <div
                                        key={tut.id}
                                        className="card glass"
                                        style={{
                                            padding: '1rem 1.1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.65rem',
                                            borderTop: `3px solid ${st.isCompleted ? '#10b981' : catMeta.color}`
                                        }}
                                    >
                                        {/* Top badges */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: `${catMeta.color}20`,
                                                        color: catMeta.color,
                                                        border: `1px solid ${catMeta.color}45`,
                                                        fontSize: '0.7rem',
                                                        padding: '0.15rem 0.45rem'
                                                    }}
                                                >
                                                    {catMeta.shortLabel}
                                                </span>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: diffStyle.bg,
                                                        color: diffStyle.color,
                                                        border: `1px solid ${diffStyle.border}`,
                                                        fontSize: '0.7rem',
                                                        padding: '0.15rem 0.45rem'
                                                    }}
                                                >
                                                    {tut.difficulty}
                                                </span>
                                            </div>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                <Clock size={12} /> {tut.duration} · {tut.steps.length} pasos
                                            </span>
                                        </div>

                                        {/* Title & Subtitle */}
                                        <div>
                                            <h2
                                                onClick={() => openTutorial(tut.id, 'full')}
                                                style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0, cursor: 'pointer', color: 'var(--text)', lineHeight: 1.35 }}
                                            >
                                                {tut.title}
                                            </h2>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.3rem 0 0 0', lineHeight: 1.45 }}>
                                                {tut.subtitle}
                                            </p>
                                        </div>

                                        {/* Mini Flow Preview */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {(tut.flowSteps || []).slice(0, 3).map((fs, i) => (
                                                <span
                                                    key={i}
                                                    style={{
                                                        fontSize: '0.69rem',
                                                        padding: '0.15rem 0.4rem',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg-secondary)',
                                                        color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)'
                                                    }}
                                                >
                                                    {fs}
                                                </span>
                                            ))}
                                            {(tut.flowSteps || []).length > 3 && (
                                                <span style={{ fontSize: '0.69rem', padding: '0.15rem 0.35rem', color: 'var(--text-muted)' }}>
                                                    +{tut.flowSteps.length - 3} más
                                                </span>
                                            )}
                                        </div>

                                        {/* Progress bar */}
                                        <div style={{ marginTop: 'auto', paddingTop: '0.25rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.71rem', marginBottom: '0.2rem', color: st.isCompleted ? '#10b981' : 'var(--text-muted)' }}>
                                                <span>{st.isCompleted ? 'Completado' : `${st.doneSteps}/${st.totalSteps} pasos`}</span>
                                                <span style={{ fontWeight: 700 }}>{st.pct}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '5px', background: 'var(--bg-secondary)', borderRadius: '999px', overflow: 'hidden' }}>
                                                <div style={{ width: `${st.pct}%`, height: '100%', background: st.isCompleted ? '#10b981' : catMeta.color, transition: 'width 0.25s ease' }} />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.45rem', borderTop: '1px solid var(--border)' }}>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                onClick={() => openTutorial(tut.id, 'full')}
                                                style={{ flex: '1 1 120px', height: '34px', padding: '0 0.7rem', fontSize: '0.77rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                            >
                                                <BookOpen size={13} />
                                                <span>Ver Guía</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => openTutorial(tut.id, 'guided')}
                                                style={{ flex: '1 1 110px', height: '34px', padding: '0 0.7rem', fontSize: '0.77rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                                title="Abrir en Modo Guiado paso por paso"
                                            >
                                                <PlayCircle size={13} color={catMeta.color} />
                                                <span>Paso a Paso</span>
                                            </button>
                                            {tut.route && (
                                                <button
                                                    type="button"
                                                    className="icon-btn"
                                                    onClick={() => handleGoToModule(tut.route, tut.routeLabel)}
                                                    title={`Ir directamente a ${tut.routeLabel}`}
                                                    style={{ height: '34px', width: '34px', border: '1px solid var(--border)' }}
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Modal compartido de Vista Previa e Impresión PDF (Tamaño Carta) */}
            <ReportPreviewModal
                isOpen={showPdfPreview}
                onClose={() => setShowPdfPreview(false)}
                pdfSource={pdfBlob}
                title={pdfTitle}
                subtitle={pdfSubtitle}
                badge={pdfBadge}
                totalPages={pdfTotalPages}
                fileName={pdfFileName}
            />
        </div>
    );
}
