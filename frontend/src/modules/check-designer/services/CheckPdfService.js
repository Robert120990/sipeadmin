import { jsPDF } from 'jspdf';
import DesignerService from './DesignerService';

const MM_TO_PX = 3.78; // 96 DPI

/**
 * Service to generate vector PDFs for check printing at Letter size (Página Completa).
 */
const CheckPdfService = {
    /**
     * Generates a multi-page jsPDF document for check printing.
     * Each check is placed on its own Letter (Carta: 215.9 x 279.4 mm) page.
     *
     * @param {Object} formato - Check format config (width, height, etc.)
     * @param {Array} campos - Field definitions from check designer
     * @param {Array<Object>} listaDatos - Array of formatted check data
     * @param {string} [printerName] - Optional printer name to apply calibration
     * @returns {Promise<jsPDF>}
     */
    async generatePdf(formato, campos, listaDatos, printerName = null) {
        // Create jsPDF in Letter portrait format (215.9mm x 279.4mm)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        if (!listaDatos || listaDatos.length === 0) {
            return doc;
        }

        // Apply printer calibration if available
        let calibracion = { offset_x: 0, offset_y: 0, scale: 1 };
        if (printerName) {
            try {
                const calibrations = await DesignerService.getCalibrations();
                calibracion = calibrations.find(c => c.printer_name === printerName) || calibracion;
            } catch (e) {
                // Ignore calibration error
            }
        }

        const visibleCampos = (campos || []).filter(c => c.visible !== false);
        const offsetX = Number(calibracion.offset_x) || 0;
        const offsetY = Number(calibracion.offset_y) || 0;
        const scale = Number(calibracion.scale) || 1;

        listaDatos.forEach((datos, pageIndex) => {
            if (pageIndex > 0) {
                doc.addPage('letter', 'portrait');
            }

            visibleCampos.forEach(c => {
                const rawVal = datos[c.tipo] || datos[c.variable] || (c.tipo === 'texto_fijo' ? c.etiqueta : '');
                if (rawVal === undefined || rawVal === null || rawVal === '') return;
                const valor = String(rawVal);

                // Millimeter coordinates scaled by calibration
                const origXMm = (Number(c.x) || 0) / MM_TO_PX;
                const origYMm = (Number(c.y) || 0) / MM_TO_PX;
                const origWidthMm = (Number(c.ancho) || 100) / MM_TO_PX;

                const xMm = (origXMm * scale) + offsetX;
                const yMm = (origYMm * scale) + offsetY;
                const widthMm = origWidthMm * scale;

                // Font size in points (1px ≈ 0.75pt)
                let fontSizePt = 10;
                if (c.fontSize) {
                    const parsed = parseInt(c.fontSize, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        fontSizePt = parsed * 0.75 * scale;
                    }
                }
                doc.setFontSize(fontSizePt);

                // Font family
                let fontName = 'helvetica';
                const fLower = (c.fuente || '').toLowerCase();
                if (fLower.includes('times')) fontName = 'times';
                else if (fLower.includes('courier')) fontName = 'courier';

                // Font style
                let fontStyle = 'normal';
                if (c.peso === 'bold' && c.estilo === 'italic') fontStyle = 'bolditalic';
                else if (c.peso === 'bold') fontStyle = 'bold';
                else if (c.estilo === 'italic') fontStyle = 'italic';

                doc.setFont(fontName, fontStyle);

                // Text color
                if (c.color && c.color.startsWith('#') && c.color.length === 7) {
                    const r = parseInt(c.color.slice(1, 3), 16);
                    const g = parseInt(c.color.slice(3, 5), 16);
                    const b = parseInt(c.color.slice(5, 7), 16);
                    doc.setTextColor(r, g, b);
                } else {
                    doc.setTextColor(0, 0, 0);
                }

                // Alignment and horizontal position
                let finalX = xMm;
                let align = 'left';
                if (c.alineacion === 'derecha' || c.alineacion === 'right') {
                    finalX = xMm + widthMm;
                    align = 'right';
                } else if (c.alineacion === 'centro' || c.alineacion === 'center') {
                    finalX = xMm + (widthMm / 2);
                    align = 'center';
                }

                // Render text with baseline top
                try {
                    doc.text(valor, finalX, yMm, {
                        align: align,
                        baseline: 'top',
                        angle: c.rotacion ? -c.rotacion : 0
                    });
                } catch (err) {
                    // Fallback without special options if needed
                    doc.text(valor, finalX, yMm);
                }
            });
        });

        return doc;
    }
};

export default CheckPdfService;
