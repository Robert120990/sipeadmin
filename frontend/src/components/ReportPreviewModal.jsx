import React, { useState, useEffect, useRef } from 'react';
import { FileText, Download, Printer, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable Report Preview Modal.
 * Displays generated PDFs with standard document viewer toolbar,
 * page navigation, download, print, and keyboard shortcuts.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Controls modal visibility
 * @param {Function} props.onClose - Modal close handler
 * @param {string} props.title - Document title (e.g. "Impresión de Cheques")
 * @param {string} props.subtitle - Document subtitle (e.g. "Cuenta: BAC#... | 15 Cheques")
 * @param {string} [props.badge] - Category or format badge (e.g. "PROMERICA" or "LIBROS DE IVA")
 * @param {React.Component} [props.icon] - Icon component (default FileText)
 * @param {Blob|string} props.pdfSource - PDF Blob or direct Blob URL
 * @param {string} [props.fileName='documento.pdf'] - File name for download
 * @param {number} [props.totalPages=1] - Total number of pages
 * @param {string} [props.footerInfo] - Text shown in the footer left section
 * @param {Function} [props.onPrint] - Optional custom print handler
 * @param {Function} [props.onDownload] - Optional custom download handler
 */
export default function ReportPreviewModal({
    isOpen,
    onClose,
    title = 'Vista Previa de Reporte',
    subtitle = '',
    badge = '',
    icon: IconComponent = FileText,
    pdfSource = null,
    fileName = 'reporte.pdf',
    totalPages = 1,
    footerInfo = 'Formato contable estándar oficial - Presentación Carta sin firmas',
    onPrint = null,
    onDownload = null
}) {
    const [currentPage, setCurrentPage] = useState(1);
    const [blobUrl, setBlobUrl] = useState('');
    const iframeRef = useRef(null);

    // Generate or update Blob URL when pdfSource changes
    useEffect(() => {
        if (!isOpen || !pdfSource) {
            if (blobUrl && blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
            }
            setBlobUrl('');
            return;
        }

        let url = '';
        if (typeof pdfSource === 'string') {
            url = pdfSource;
        } else if (pdfSource instanceof Blob) {
            url = URL.createObjectURL(pdfSource);
        }

        setBlobUrl(url);
        setCurrentPage(1);

        return () => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, pdfSource]);

    // Keyboard navigation (ESC to close, Left/Right to change page)
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, currentPage, totalPages]);

    if (!isOpen) return null;

    const handlePrev = () => {
        setCurrentPage((prev) => Math.max(1, prev - 1));
    };

    const handleNext = () => {
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
    };

    const handlePageInput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
            setCurrentPage(val);
        }
    };

    const handleDownload = () => {
        if (onDownload) {
            onDownload();
            return;
        }
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handlePrint = () => {
        if (onPrint) {
            onPrint();
            return;
        }
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.focus();
                iframeRef.current.contentWindow.print();
                return;
            } catch (e) {
                // Fallback to window.open
            }
        }
        if (blobUrl) {
            const printWin = window.open(blobUrl, '_blank');
            if (printWin) {
                printWin.onload = () => printWin.print();
            }
        }
    };

    const handlePopout = () => {
        if (blobUrl) {
            window.open(blobUrl, '_blank');
        }
    };

    const iframeSrc = blobUrl ? `${blobUrl}#page=${currentPage}&toolbar=1` : '';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(4px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#ffffff',
                    width: '95vw',
                    maxWidth: '1440px',
                    height: '92vh',
                    borderRadius: '14px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        backgroundColor: '#ffffff',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '0.65rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flexWrap: 'wrap'
                    }}
                >
                    {/* Left: Icon, Title, Badge, Subtitle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                backgroundColor: '#4f46e5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                flexShrink: 0
                            }}
                        >
                            <IconComponent size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                                    {title}
                                </h2>
                                {badge && (
                                    <span
                                        style={{
                                            backgroundColor: '#e0e7ff',
                                            color: '#4338ca',
                                            padding: '0.15rem 0.55rem',
                                            borderRadius: '9999px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.03em',
                                            textTransform: 'uppercase'
                                        }}
                                    >
                                        {badge}
                                    </span>
                                )}
                            </div>
                            {subtitle && (
                                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.2 }}>
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Center: Pagination Navigator */}
                    {totalPages > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: '#f9fafb',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '0.2rem 0.5rem'
                            }}
                        >
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={currentPage <= 1}
                                title="Página anterior"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                                    padding: '0.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: currentPage <= 1 ? '#d1d5db' : '#374151',
                                    borderRadius: '4px'
                                }}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.04em' }}>
                                PÁG.
                            </span>
                            <input
                                type="number"
                                value={currentPage}
                                onChange={handlePageInput}
                                min={1}
                                max={totalPages}
                                style={{
                                    width: '42px',
                                    height: '26px',
                                    textAlign: 'center',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '0.825rem',
                                    fontWeight: 600,
                                    padding: 0,
                                    backgroundColor: '#ffffff',
                                    color: '#111827'
                                }}
                            />
                            <span style={{ fontSize: '0.825rem', color: '#9ca3af', fontWeight: 600 }}>
                                / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={currentPage >= totalPages}
                                title="Página siguiente"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                                    padding: '0.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: currentPage >= totalPages ? '#d1d5db' : '#374151',
                                    borderRadius: '4px'
                                }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <button
                            type="button"
                            onClick={handleDownload}
                            title="Descargar documento PDF"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                height: '34px',
                                padding: '0 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #d1d5db',
                                backgroundColor: '#ffffff',
                                color: '#374151',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Download size={15} />
                            Descargar PDF
                        </button>

                        <button
                            type="button"
                            onClick={handlePrint}
                            title="Imprimir documento"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                height: '34px',
                                padding: '0 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #d1d5db',
                                backgroundColor: '#ffffff',
                                color: '#374151',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Printer size={15} />
                            Imprimir
                        </button>

                        <button
                            type="button"
                            onClick={handlePopout}
                            title="Abrir en pestaña nueva"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#6b7280',
                                cursor: 'pointer',
                                padding: '0.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '6px'
                            }}
                        >
                            <ExternalLink size={18} />
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            title="Cerrar vista previa"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#6b7280',
                                cursor: 'pointer',
                                padding: '0.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '6px'
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body: Native PDF Viewer in Iframe */}
                <div style={{ flex: 1, position: 'relative', backgroundColor: '#525659', overflow: 'hidden' }}>
                    {blobUrl ? (
                        <iframe
                            ref={iframeRef}
                            src={iframeSrc}
                            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                            title={title}
                        />
                    ) : (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: '#9ca3af'
                            }}
                        >
                            <FileText size={48} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>Cargando vista previa del documento...</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        backgroundColor: '#ffffff',
                        borderTop: '1px solid #e5e7eb',
                        padding: '0.55rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flexWrap: 'wrap'
                    }}
                >
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                        {footerInfo}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <kbd style={{ padding: '0.1rem 0.35rem', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.7rem' }}>←</kbd>
                            <kbd style={{ padding: '0.1rem 0.35rem', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.7rem' }}>→</kbd>
                            <span>para cambiar página</span>
                        </span>

                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <kbd style={{ padding: '0.1rem 0.35rem', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.7rem' }}>ESC</kbd>
                            <span>para salir</span>
                        </span>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '0.35rem 0.95rem',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                backgroundColor: '#ffffff',
                                color: '#374151',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
