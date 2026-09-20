import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    GitCommit,
    ExternalLink,
    Copy,
    Check,
    Search,
    RefreshCw,
    FileText,
    FileSpreadsheet,
    Calendar,
    User,
    Sparkles,
    Shield,
    Layers,
    Clock,
    CheckCircle2,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    FileCode,
    Plus,
    Minus,
    Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { useToast } from '../components/Toast';

/**
 * Semantic type styling configuration
 */
const TYPE_CONFIG = {
    feat: {
        label: 'FEAT / NUEVO',
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#10b981',
        border: 'rgba(16, 185, 129, 0.3)',
        description: 'Nueva funcionalidad o mejora'
    },
    fix: {
        label: 'FIX / PARCHE',
        bg: 'rgba(239, 68, 68, 0.12)',
        color: '#ef4444',
        border: 'rgba(239, 68, 68, 0.3)',
        description: 'Corrección de error o bug'
    },
    chore: {
        label: 'CHORE / VER',
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#f59e0b',
        border: 'rgba(245, 158, 11, 0.3)',
        description: 'Mantenimiento, dependencias o versión'
    },
    refactor: {
        label: 'REFACTOR',
        bg: 'rgba(139, 92, 246, 0.12)',
        color: '#8b5cf6',
        border: 'rgba(139, 92, 246, 0.3)',
        description: 'Reestructuración de código'
    },
    docs: {
        label: 'DOCS / REGLAS',
        bg: 'rgba(14, 165, 233, 0.12)',
        color: '#0ea5e9',
        border: 'rgba(14, 165, 233, 0.3)',
        description: 'Documentación o guías'
    },
    test: {
        label: 'TEST / QA',
        bg: 'rgba(99, 102, 241, 0.12)',
        color: '#6366f1',
        border: 'rgba(99, 102, 241, 0.3)',
        description: 'Pruebas y verificación automatizada'
    },
    other: {
        label: 'CAMBIO',
        bg: 'rgba(148, 163, 184, 0.12)',
        color: '#94a3b8',
        border: 'rgba(148, 163, 184, 0.3)',
        description: 'Actualización general'
    }
};

/**
 * Format relative time in Spanish
 */
function formatRelativeTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Hace unos segundos';
    if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    if (diffHour < 24) return `Hace ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} ${Math.floor(diffDays / 7) === 1 ? 'semana' : 'semanas'}`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format exact date and time in Spanish
 */
function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

export default function ConsultaCambiosGithub() {
    const { addToast } = useToast();

    // Data states
    const [commits, setCommits] = useState([]);
    const [kpis, setKpis] = useState({
        totalCommits: 0,
        featCount: 0,
        fixCount: 0,
        choreCount: 0,
        otherCount: 0,
        lastDeploy: null,
        currentVersion: '1.0.0',
        authorsCount: 0
    });
    const [authors, setAuthors] = useState([]);
    const [repoName, setRepoName] = useState('Robert120990/sipeadmin');
    const [dataSource, setDataSource] = useState('github');

    // UI & filter states
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedAuthor, setSelectedAuthor] = useState('all');
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);

    // Interaction states
    const [copiedSha, setCopiedSha] = useState(null);

    // Commit detail modal
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // ReportPreviewModal (Letter size PDF)
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewPages, setPreviewPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('');
    const [previewSubtitle, setPreviewSubtitle] = useState('');

    /**
     * Fetch commits list from backend
     */
    const loadCommits = useCallback(async (isRefresh = false, pageToLoad = 1) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const params = new URLSearchParams({
                page: String(pageToLoad),
                limit: String(limit),
                search: searchQuery.trim(),
                type: selectedType,
                author: selectedAuthor,
                force: isRefresh ? 'true' : 'false'
            });

            const { data } = await api.get(`/seguridad/cambios-github?${params.toString()}`);

            setCommits(data.data || []);
            setKpis(data.kpis || {});
            setAuthors(data.authors || []);
            setTotalPages(data.pagination?.totalPages || 1);
            setTotalResults(data.pagination?.total || 0);
            setPage(data.pagination?.page || 1);
            setDataSource(data.source || 'github');
            if (data.repo) setRepoName(data.repo);

            if (isRefresh) {
                addToast('Historial de cambios sincronizado con GitHub exitosamente', 'success');
            }
        } catch (err) {
            console.error('Error fetching github changes:', err);
            const msg = err.response?.data?.message || err.message || 'Error al conectar con GitHub';
            addToast(`Error al consultar cambios: ${msg}`, 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [limit, searchQuery, selectedType, selectedAuthor, addToast]);

    // Initial load
    useEffect(() => {
        loadCommits(false, 1);
    }, [loadCommits]);

    /**
     * Copy SHA to clipboard
     */
    const handleCopySha = (sha, e) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(sha);
        setCopiedSha(sha);
        addToast(`Hash ${sha.substring(0, 7)} copiado al portapapeles`, 'success');
        setTimeout(() => setCopiedSha(null), 2500);
    };

    /**
     * View commit detail
     */
    const handleViewDetail = async (commit) => {
        setSelectedCommit(commit);
        setDetailModalOpen(true);
        setLoadingDetail(true);

        try {
            const { data } = await api.get(`/seguridad/cambios-github/${commit.sha}`);
            setSelectedCommit(data.data || commit);
        } catch (err) {
            console.warn('Could not load full commit files:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    /**
     * Export to Excel (.xlsx)
     */
    const handleExportExcel = () => {
        if (!commits || commits.length === 0) {
            addToast('No hay cambios para exportar en la vista actual', 'warning');
            return;
        }

        const rows = commits.map(c => ({
            'Hash Commit': c.sha,
            'Hash Corto': c.shortSha,
            'Tipo': c.type.toUpperCase(),
            'Alcance': c.scope || 'GENERAL',
            'Mensaje del Cambio': c.subject,
            'Descripción Detallada': c.body || '',
            'Autor': c.authorName,
            'Correo Autor': c.authorEmail || '',
            'Fecha y Hora': formatDateTime(c.date),
            'Enlace GitHub': c.url
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Historial_Cambios');

        const fileName = `Cambios_GitHub_${repoName.replace(/\//g, '_')}_v${kpis.currentVersion}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        addToast('Historial de cambios exportado a Excel correctamente', 'success');
    };

    /**
     * Generate Letter-Size PDF Report with ReportPreviewModal
     */
    const handleGeneratePdfReport = () => {
        if (!commits || commits.length === 0) {
            addToast('No hay registros de cambios para generar el informe', 'warning');
            return;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter' // 215.9mm x 279.4mm obligatorio según /ui_standards.md
        });

        const pageWidth = 215.9;
        const pageHeight = 279.4;

        // Header decorativo
        doc.setFillColor(30, 41, 59); // Slate 800
        doc.rect(0, 0, pageWidth, 26, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text('SIPE ADMIN - CONTROL Y AUDITORÍA DE CAMBIOS GITHUB', 14, 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(203, 213, 225);
        doc.text(`Repositorio Oficial: https://github.com/${repoName} | Versión Activa: v${kpis.currentVersion}`, 14, 18);
        doc.text(`Generado: ${new Date().toLocaleString('es-ES')} | Usuario: Auditoría SIPE`, 14, 22);

        // Subheader summary boxes
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 30, pageWidth - 28, 14, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);

        const summaryText = `Total Cambios Listados: ${commits.length} de ${totalResults} | Nuevas Funcionalidades: ${kpis.featCount} | Correcciones: ${kpis.fixCount} | Mantenimiento/Versiones: ${kpis.choreCount}`;
        doc.text(summaryText, 18, 38);

        // Table definition
        const tableColumns = [
            { header: 'Hash', dataKey: 'sha' },
            { header: 'Tipo', dataKey: 'type' },
            { header: 'Mensaje de Actualización', dataKey: 'message' },
            { header: 'Autor', dataKey: 'author' },
            { header: 'Fecha', dataKey: 'date' }
        ];

        const tableRows = commits.map(c => ({
            sha: c.shortSha || c.sha?.substring(0, 7),
            type: (c.type || 'other').toUpperCase(),
            message: c.scope ? `[${c.scope}] ${c.subject}` : c.subject,
            author: c.authorName || 'Desconocido',
            date: formatDateTime(c.date)
        }));

        autoTable(doc, {
            columns: tableColumns,
            body: tableRows,
            startY: 48,
            theme: 'striped',
            styles: {
                fontSize: 7.5,
                cellPadding: 2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [37, 99, 235], // SIPE Blue
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8
            },
            columnStyles: {
                sha: { cellWidth: 20, fontStyle: 'bold', textColor: [37, 99, 235] },
                type: { cellWidth: 22, fontStyle: 'bold' },
                message: { cellWidth: 'auto' },
                author: { cellWidth: 32 },
                date: { cellWidth: 34, fontSize: 7 }
            },
            margin: { left: 14, right: 14, bottom: 20 },
            didDrawPage: (data) => {
                // Footer
                const str = `Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`;
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(str, pageWidth - 35, pageHeight - 10);
                doc.text('Formato Oficial SIPE Admin - Tamaño Carta (215.9 x 279.4 mm)', 14, pageHeight - 10);
            }
        });

        const totalPdfPages = doc.internal.getNumberOfPages();
        const blob = doc.output('blob');

        setPreviewPdfBlob(blob);
        setPreviewPages(totalPdfPages);
        setPreviewTitle('Auditoría de Cambios y Versiones GitHub');
        setPreviewSubtitle(`Repositorio: ${repoName} | ${commits.length} registros | Versión v${kpis.currentVersion}`);
        setPreviewModalOpen(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Encabezado de Página Compacto */}
            <div className="page-header" style={{ marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(99, 102, 241, 0.2))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary-color, #2563eb)'
                    }}>
                        <GitCommit size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Consulta de Cambios en GitHub
                            <span style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                background: dataSource === 'github' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: dataSource === 'github' ? '#10b981' : '#f59e0b',
                                border: `1px solid ${dataSource === 'github' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                fontWeight: 600
                            }}>
                                {dataSource === 'github' ? '● En Vivo (GitHub API)' : '● Registro Local Git'}
                            </span>
                        </h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                            Historial ejecutivo de actualizaciones, nuevas funciones y correcciones subidas al repositorio oficial <strong style={{ color: 'var(--text-color)' }}>{repoName}</strong>.
                        </p>
                    </div>
                </div>

                {/* Acciones de Encabezado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => loadCommits(true, page)}
                        disabled={refreshing}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.85rem' }}
                        title="Sincronizar directamente con los últimos commits en GitHub"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Sincronizando...' : 'Refrescar'}
                    </button>

                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleExportExcel}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.85rem' }}
                    >
                        <FileSpreadsheet size={14} style={{ color: '#10b981' }} />
                        Excel
                    </button>

                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleGeneratePdfReport}
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.85rem' }}
                    >
                        <FileText size={14} />
                        Informe Carta PDF
                    </button>
                </div>
            </div>

            {/* Tarjetas de Métricas Ejecutivas / KPIs */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem'
            }}>
                {/* Versión Desplegada */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Versión Activa
                        </span>
                        <Shield size={16} style={{ color: 'var(--primary-color, #2563eb)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-color)' }}>
                            v{kpis.currentVersion}
                        </span>
                        <span style={{
                            fontSize: '0.68rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontWeight: 700
                        }}>
                            PRODUCCIÓN
                        </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Rama principal: <code>main</code>
                    </span>
                </div>

                {/* Nuevas Funcionalidades */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Funcionalidades (feat)
                        </span>
                        <Sparkles size={16} style={{ color: '#10b981' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>
                            {kpis.featCount}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            módulos / mejoras
                        </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Nuevas características entregadas
                    </span>
                </div>

                {/* Correcciones y Parches */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Correcciones (fix)
                        </span>
                        <CheckCircle2 size={16} style={{ color: '#ef4444' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>
                            {kpis.fixCount}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            parches aplicados
                        </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Ajustes de estabilidad y seguridad
                    </span>
                </div>

                {/* Mantenimiento / Versiones */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Mantenimiento (chore)
                        </span>
                        <Layers size={16} style={{ color: '#f59e0b' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>
                            {kpis.choreCount}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            versiones y deps
                        </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Control continuo del repositorio
                    </span>
                </div>

                {/* Último Despliegue */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Último Despliegue
                        </span>
                        <Clock size={16} style={{ color: '#8b5cf6' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color)' }}>
                            {formatRelativeTime(kpis.lastDeploy)}
                        </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} title={formatDateTime(kpis.lastDeploy)}>
                        {commits[0]?.authorName ? `Por: ${commits[0].authorName}` : 'Sincronizado'}
                    </span>
                </div>
            </div>

            {/* Barra de Filtros Compacta */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    {/* Buscador de texto */}
                    <div style={{ flex: '1 1 240px', minWidth: '220px', position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por mensaje, hash o autor..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') loadCommits(false, 1); }}
                            style={{
                                height: '36px',
                                fontSize: '0.825rem',
                                paddingLeft: '32px'
                            }}
                        />
                    </div>

                    {/* Filtro por Tipo Semántico */}
                    <div style={{ width: '180px' }}>
                        <select
                            className="form-control"
                            value={selectedType}
                            onChange={e => {
                                setSelectedType(e.target.value);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="all">Todos los Tipos</option>
                            <option value="feat">✨ Nuevas Funcionalidades (feat)</option>
                            <option value="fix">🛠️ Correcciones (fix)</option>
                            <option value="chore">📦 Mantenimiento (chore)</option>
                            <option value="refactor">♻️ Refactorización (refactor)</option>
                            <option value="docs">📝 Documentación y Reglas (docs)</option>
                            <option value="test">🧪 Pruebas Automatizadas (test)</option>
                            <option value="other">⚙️ Otros Cambios</option>
                        </select>
                    </div>

                    {/* Filtro por Autor */}
                    <div style={{ width: '160px' }}>
                        <select
                            className="form-control"
                            value={selectedAuthor}
                            onChange={e => {
                                setSelectedAuthor(e.target.value);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="all">Todos los Autores</option>
                            {authors.map(author => (
                                <option key={author} value={author}>
                                    {author}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Botón Aplicar Filtro */}
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => loadCommits(false, 1)}
                        style={{ height: '36px', fontSize: '0.825rem', padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Search size={14} />
                        Filtrar
                    </button>

                    {/* Botón Limpiar Filtros */}
                    {(searchQuery || selectedType !== 'all' || selectedAuthor !== 'all') && (
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedType('all');
                                setSelectedAuthor('all');
                            }}
                            style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.85rem' }}
                        >
                            Limpiar Filtros
                        </button>
                    )}

                    <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Mostrando <strong style={{ color: 'var(--text-color)' }}>{commits.length}</strong> de <strong style={{ color: 'var(--text-color)' }}>{totalResults}</strong> cambios
                    </div>
                </div>
            </div>

            {/* Tabla de Cambios Compacta */}
            <div className="card glass table-responsive" style={{ padding: '0' }}>
                <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--table-header-bg, rgba(0, 0, 0, 0.04))', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))' }}>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '110px' }}>
                                Commit / SHA
                            </th>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '130px' }}>
                                Tipo
                            </th>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                Mensaje de Cambio Subido a GitHub
                            </th>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '160px' }}>
                                Autor
                            </th>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', width: '140px' }}>
                                Fecha / Hora
                            </th>
                            <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center', width: '90px' }}>
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
                                        <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--primary-color, #2563eb)' }} />
                                        Cargando cambios subidos a GitHub...
                                    </div>
                                </td>
                            </tr>
                        ) : commits.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertCircle size={32} style={{ opacity: 0.5 }} />
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>No se encontraron cambios con los filtros seleccionados</span>
                                        <span style={{ fontSize: '0.8rem' }}>Intenta ajustar el texto de búsqueda o el tipo de commit.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            commits.map((commit, idx) => {
                                const typeStyle = TYPE_CONFIG[commit.type] || TYPE_CONFIG.other;
                                const isCopied = copiedSha === commit.sha;

                                return (
                                    <tr
                                        key={commit.sha || idx}
                                        style={{
                                            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                                            transition: 'background 0.15s ease',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => handleViewDetail(commit)}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {/* SHA y enlaces */}
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <code style={{
                                                    fontSize: '0.76rem',
                                                    fontWeight: 700,
                                                    padding: '0.15rem 0.4rem',
                                                    borderRadius: '4px',
                                                    background: 'rgba(37, 99, 235, 0.08)',
                                                    color: 'var(--primary-color, #2563eb)'
                                                }}>
                                                    {commit.shortSha}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopySha(commit.sha, e)}
                                                    className="icon-btn"
                                                    style={{ padding: '2px', color: isCopied ? '#10b981' : 'var(--text-muted)' }}
                                                    title={isCopied ? 'Copiado' : 'Copiar hash completo'}
                                                >
                                                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                                                </button>
                                                <a
                                                    href={commit.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    className="icon-btn"
                                                    style={{ padding: '2px', color: 'var(--text-muted)' }}
                                                    title="Ver en GitHub"
                                                >
                                                    <ExternalLink size={13} />
                                                </a>
                                            </div>
                                        </td>

                                        {/* Badge de Tipo Semántico */}
                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                padding: '0.18rem 0.5rem',
                                                borderRadius: '4px',
                                                background: typeStyle.bg,
                                                color: typeStyle.color,
                                                border: `1px solid ${typeStyle.border}`
                                            }}>
                                                {typeStyle.label}
                                            </span>
                                        </td>

                                        {/* Mensaje de Cambio y Scope */}
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.825rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                    {commit.scope && (
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            padding: '0.08rem 0.35rem',
                                                            borderRadius: '3px',
                                                            background: 'rgba(255, 255, 255, 0.08)',
                                                            color: 'var(--text-muted)',
                                                            border: '1px solid rgba(255, 255, 255, 0.12)'
                                                        }}>
                                                            ({commit.scope})
                                                        </span>
                                                    )}
                                                    <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                                                        {commit.subject}
                                                    </span>
                                                </div>
                                                {commit.body && (
                                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '580px' }}>
                                                        {commit.body.split('\n')[0]}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Autor */}
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {commit.authorAvatar ? (
                                                    <img
                                                        src={commit.authorAvatar}
                                                        alt={commit.authorName}
                                                        style={{ width: '22px', height: '22px', borderRadius: '50%' }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: '22px',
                                                        height: '22px',
                                                        borderRadius: '50%',
                                                        background: 'rgba(37, 99, 235, 0.15)',
                                                        color: 'var(--primary-color, #2563eb)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700
                                                    }}>
                                                        {commit.authorName?.charAt(0)?.toUpperCase() || 'A'}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                                                        {commit.authorName}
                                                    </span>
                                                    {commit.authorEmail && (
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {commit.authorEmail.split('@')[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Fecha y Tiempo Relativo */}
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                                <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                                                    {formatRelativeTime(commit.date)}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title={formatDateTime(commit.date)}>
                                                    {commit.date ? new Date(commit.date).toLocaleDateString('es-ES') : '-'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Acciones */}
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleViewDetail(commit);
                                                }}
                                                style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            >
                                                <Layers size={13} />
                                                Detalle
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginador Compacto */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 0.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Página <strong style={{ color: 'var(--text-color)' }}>{page}</strong> de <strong style={{ color: 'var(--text-color)' }}>{totalPages}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => loadCommits(false, page - 1)}
                            disabled={page <= 1 || loading}
                            style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <ChevronLeft size={15} />
                            Anterior
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => loadCommits(false, page + 1)}
                            disabled={page >= totalPages || loading}
                            style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            Siguiente
                            <ChevronRight size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Detalle del Commit (Archivos Afectados) */}
            <Modal
                isOpen={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                title="Detalle del Cambio en Repositorio"
                size="lg"
            >
                {selectedCommit && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Cabecera del Commit */}
                        <div style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            background: 'var(--card-bg, rgba(255, 255, 255, 0.04))',
                            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.6rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        background: TYPE_CONFIG[selectedCommit.type]?.bg || TYPE_CONFIG.other.bg,
                                        color: TYPE_CONFIG[selectedCommit.type]?.color || TYPE_CONFIG.other.color,
                                        border: `1px solid ${TYPE_CONFIG[selectedCommit.type]?.border || TYPE_CONFIG.other.border}`
                                    }}>
                                        {TYPE_CONFIG[selectedCommit.type]?.label || 'CAMBIO'}
                                    </span>
                                    {selectedCommit.scope && (
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            ({selectedCommit.scope})
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <code style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.2rem 0.45rem', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-color, #2563eb)' }}>
                                        {selectedCommit.shortSha}
                                    </code>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={() => handleCopySha(selectedCommit.sha)}
                                        title="Copiar Hash SHA"
                                    >
                                        <Copy size={14} />
                                    </button>
                                    <a
                                        href={selectedCommit.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary"
                                        style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <ExternalLink size={13} />
                                        Abrir en GitHub
                                    </a>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-color)' }}>
                                {selectedCommit.subject}
                            </h3>

                            {selectedCommit.body && (
                                <div style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'pre-line',
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    background: 'rgba(0, 0, 0, 0.15)',
                                    border: '1px solid rgba(255, 255, 255, 0.05)'
                                }}>
                                    {selectedCommit.body}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                <span>Autor: <strong style={{ color: 'var(--text-color)' }}>{selectedCommit.authorName}</strong> {selectedCommit.authorEmail ? `(${selectedCommit.authorEmail})` : ''}</span>
                                <span>Fecha: <strong style={{ color: 'var(--text-color)' }}>{formatDateTime(selectedCommit.date)}</strong></span>
                            </div>
                        </div>

                        {/* Resumen de Líneas Modificadas */}
                        {selectedCommit.stats && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                fontSize: '0.825rem'
                            }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>Impacto en Código:</span>
                                <span style={{ color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Plus size={14} /> +{selectedCommit.stats.additions || 0} líneas agregadas
                                </span>
                                <span style={{ color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Minus size={14} /> -{selectedCommit.stats.deletions || 0} líneas eliminadas
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                    Total: {selectedCommit.stats.total || (selectedCommit.stats.additions + selectedCommit.stats.deletions)} cambios
                                </span>
                            </div>
                        )}

                        {/* Lista de Archivos Modificados */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FileCode size={16} style={{ color: 'var(--primary-color, #2563eb)' }} />
                                    Archivos Modificados ({selectedCommit.files?.length || 0})
                                </h4>
                            </div>

                            {loadingDetail ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={18} className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
                                    Cargando lista de archivos modificados...
                                </div>
                            ) : !selectedCommit.files || selectedCommit.files.length === 0 ? (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                    Información de archivos disponible directamente en GitHub.
                                </div>
                            ) : (
                                <div style={{
                                    maxHeight: '260px',
                                    overflowY: 'auto',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))'
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0, 0, 0, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Archivo</th>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', width: '90px' }}>Estado</th>
                                                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)', width: '100px' }}>Líneas (+/-)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedCommit.files.map((file, fIdx) => (
                                                <tr key={fIdx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                                    <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                                                        {file.filename}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 600,
                                                            padding: '0.1rem 0.4rem',
                                                            borderRadius: '3px',
                                                            background: file.status === 'added' ? 'rgba(16, 185, 129, 0.15)' : file.status === 'deleted' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                                                            color: file.status === 'added' ? '#10b981' : file.status === 'deleted' ? '#ef4444' : '#3b82f6'
                                                        }}>
                                                            {file.status === 'added' ? 'AÑADIDO' : file.status === 'deleted' ? 'ELIMINADO' : 'MODIFICADO'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        <span style={{ color: '#10b981' }}>+{file.additions}</span> / <span style={{ color: '#ef4444' }}>-{file.deletions}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Botón Cerrar Modal */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setDetailModalOpen(false)}
                                style={{ height: '34px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal de Vista Previa e Impresión Carta (ReportPreviewModal) */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge="SEGURIDAD"
                pdfSource={previewPdfBlob}
                fileName={`Auditoria_Cambios_GitHub_v${kpis.currentVersion}.pdf`}
                totalPages={previewPages}
                footerInfo="Informe Oficial de Auditoría y Versiones SIPE Admin - Tamaño Carta"
            />
        </div>
    );
}
