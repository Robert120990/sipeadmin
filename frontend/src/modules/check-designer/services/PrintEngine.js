import DesignerService from './DesignerService';

const MM_TO_PX = 3.78; // 96 DPI

const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const sanitizeCssValue = (val, fallback = '') => {
    if (val === null || val === undefined) return fallback;
    return String(val).replace(/[<>"'`;\\]/g, '').trim() || fallback;
};

/**
 * Motor de impresión por navegador.
 * Genera un documento HTML con el diseño y lo envía a la impresora del sistema.
 * La arquitectura permite sustituir este motor (p. ej. QZ Tray) sin tocar el diseñador.
 */
const PrintEngine = {

    /**
     * Genera la hoja de calibración con líneas, cuadrícula y coordenadas.
     * @param {Object} formato - Formato del cheque (ancho, alto, márgenes).
     */
    printCalibrationSheet(formato) {
        const widthMm = Number(formato?.width) || 152.4;
        const heightMm = Number(formato?.height) || 69.85;
        const widthPx = widthMm * MM_TO_PX;
        const heightPx = heightMm * MM_TO_PX;

        let gridHtml = '';
        for (let i = 0; i <= Math.round(widthPx / 20); i++) {
            const x = i * 20;
            gridHtml += `<div style="position:absolute;left:${x}px;top:0;width:1px;height:${heightPx}px;background:#ddd;"></div>`;
        }
        for (let j = 0; j <= Math.round(heightPx / 20); j++) {
            const y = j * 20;
            gridHtml += `<div style="position:absolute;left:0;top:${y}px;width:${widthPx}px;height:1px;background:#ddd;"></div>`;
        }

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Hoja de Calibración</title>
<style>
    body { margin: 0; padding: 0; }
    @page { margin: 0; }
    .sheet { position: relative; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; font-family: monospace; }
    .coord { position: absolute; font-size: 6px; color: #999; }
</style>
</head>
<body>
<div class="sheet">
    ${gridHtml}
    <div style="position:absolute;left:0;top:0;width:${widthPx}px;height:1px;background:#000;"></div>
    <div style="position:absolute;left:0;top:${heightPx - 1}px;width:${widthPx}px;height:1px;background:#000;"></div>
    <div style="position:absolute;left:0;top:0;width:1px;height:${heightPx}px;background:#000;"></div>
    <div style="position:absolute;left:${widthPx - 1}px;top:0;width:1px;height:${heightPx}px;background:#000;"></div>
    <div style="position:absolute;left:50%;top:0;width:1px;height:${heightPx}px;background:#000;"></div>
    <div style="position:absolute;left:0;top:50%;width:${widthPx}px;height:1px;background:#000;"></div>
    <div style="position:absolute;left:4px;top:4px;font-size:8px;">HOJA DE CALIBRACIÓN — ${escapeHtml(formato?.name || '')}</div>
    <div class="coord" style="left:4px;top:${heightPx / 2 + 4}px;">CENTRO Y</div>
    <div class="coord" style="left:${widthPx / 2 + 4}px;top:4px;">CENTRO X</div>
    <div class="coord" style="left:4px;top:${heightPx - 14}px;">0,${Math.round(heightPx)}px</div>
    <div class="coord" style="left:${widthPx - 50}px;top:${heightPx - 14}px;">${Math.round(widthPx)},${Math.round(heightPx)}px</div>
    <div class="coord" style="left:${widthPx / 2 - 30}px;top:${heightPx - 14}px;">(${Math.round(widthMm)} x ${Math.round(heightMm)} mm)</div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

        this._openPrintWindow(html);
    },

    /**
     * Imprime el cheque con datos reales aplicando la calibración de la impresora.
     * @param {Object} formato - Formato del cheque.
     * @param {Array} campos - Campos del diseño.
     * @param {Object} datos - Datos del cheque.
     * @param {string} printerName - Nombre de la impresora para aplicar calibración.
     */
    async printCheck(formato, campos, datos, printerName) {
        const widthMm = Number(formato?.width) || 152.4;
        const heightMm = Number(formato?.height) || 69.85;
        const widthPx = widthMm * MM_TO_PX;
        const heightPx = heightMm * MM_TO_PX;

        let calibracion = { offset_x: 0, offset_y: 0, scale: 1 };
        if (printerName) {
            try {
                const calibrations = await DesignerService.getCalibrations();
                calibracion = calibrations.find(c => c.printer_name === printerName) || calibracion;
            } catch (e) {
                // Sin calibración disponible, continuar con valores por defecto
            }
        }

        const camposHtml = campos
            .filter(c => c.visible !== false)
            .map(c => {
                const rawValor = datos[c.tipo] || datos[c.variable] || (c.tipo === 'texto_fijo' ? c.etiqueta : '');
                const valor = escapeHtml(rawValor);
                return `<div style="position:absolute;left:${Number(c.x) || 0}px;top:${Number(c.y) || 0}px;width:${Number(c.ancho) || 0}px;height:${Number(c.alto) || 0}px;
                    transform:rotate(${Number(c.rotacion) || 0}deg);
                    font-family:${sanitizeCssValue(c.fuente, 'Arial')};
                    font-size:${sanitizeCssValue(c.fontSize, '12px')};
                    font-weight:${c.peso === 'bold' ? 'bold' : 'normal'};
                    font-style:${c.estilo === 'italic' ? 'italic' : 'normal'};
                    text-decoration:${c.subrayado ? 'underline' : 'none'};
                    color:${sanitizeCssValue(c.color, '#000')};
                    text-align:${c.alineacion === 'centro' ? 'center' : c.alineacion === 'derecha' ? 'right' : 'left'};
                    white-space:nowrap;overflow:hidden;line-height:1.2;">${valor}</div>`;
            })
            .join('\n');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Cheque — ${escapeHtml(datos.numero_cheque || '')}</title>
<style>
    body { margin: 0; padding: 0; }
    @page {
        size: letter;
        margin: 0;
    }
    .page {
        position: relative;
        width: 215.9mm;
        height: 279.4mm;
        box-sizing: border-box;
        overflow: hidden;
    }
    .sheet { position: relative; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; }
    .content { position: absolute; left: 0; top: 0; width: ${widthPx}px; height: ${heightPx}px;
             transform: scale(${Number(calibracion.scale) || 1});
             transform-origin: ${(Number(calibracion.offset_x) || 0) * -1}px ${(Number(calibracion.offset_y) || 0) * -1}px; }
</style>
</head>
<body>
<div class="page"><div class="sheet"><div class="content">${camposHtml}</div></div></div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

        this._openPrintWindow(html);
    },

    /**
     * Imprime una lista de cheques en lote, cada uno en una página separada a tamaño Carta completo.
     * @param {Object} formato - Formato del cheque.
     * @param {Array} campos - Campos del diseño.
     * @param {Array<Object>} listaDatos - Lista de datos de cheques a imprimir.
     * @param {string} printerName - Nombre de la impresora para aplicar calibración.
     */
    async printBatch(formato, campos, listaDatos, printerName) {
        if (!listaDatos || listaDatos.length === 0) return;

        const widthMm = Number(formato?.width) || 152.4;
        const heightMm = Number(formato?.height) || 69.85;
        const widthPx = widthMm * MM_TO_PX;
        const heightPx = heightMm * MM_TO_PX;

        let calibracion = { offset_x: 0, offset_y: 0, scale: 1 };
        if (printerName) {
            try {
                const calibrations = await DesignerService.getCalibrations();
                calibracion = calibrations.find(c => c.printer_name === printerName) || calibracion;
            } catch (e) {
                // Sin calibración disponible, continuar con valores por defecto
            }
        }

        const visibleCampos = (campos || []).filter(c => c.visible !== false);

        const pagesHtml = listaDatos.map(datos => {
            const camposHtml = visibleCampos.map(c => {
                const rawValor = datos[c.tipo] || datos[c.variable] || (c.tipo === 'texto_fijo' ? c.etiqueta : '');
                const valor = escapeHtml(rawValor);
                return `<div style="position:absolute;left:${Number(c.x) || 0}px;top:${Number(c.y) || 0}px;width:${Number(c.ancho) || 0}px;height:${Number(c.alto) || 0}px;
                    transform:rotate(${Number(c.rotacion) || 0}deg);
                    font-family:${sanitizeCssValue(c.fuente, 'Arial')};
                    font-size:${sanitizeCssValue(c.fontSize, '12px')};
                    font-weight:${c.peso === 'bold' ? 'bold' : 'normal'};
                    font-style:${c.estilo === 'italic' ? 'italic' : 'normal'};
                    text-decoration:${c.subrayado ? 'underline' : 'none'};
                    color:${sanitizeCssValue(c.color, '#000')};
                    text-align:${c.alineacion === 'centro' ? 'center' : c.alineacion === 'derecha' ? 'right' : 'left'};
                    white-space:nowrap;overflow:hidden;line-height:1.2;">${valor}</div>`;
            }).join('\n');

            return `<div class="page"><div class="sheet"><div class="content">${camposHtml}</div></div></div>`;
        }).join('\n');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Impresión de Cheques (${listaDatos.length})</title>
<style>
    body { margin: 0; padding: 0; }
    @page {
        size: letter;
        margin: 0;
    }
    .page {
        position: relative;
        width: 215.9mm;
        height: 279.4mm;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
        box-sizing: border-box;
    }
    .page:last-child {
        page-break-after: avoid;
        break-after: avoid;
    }
    .sheet {
        position: relative;
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        overflow: hidden;
    }
    .content {
        position: absolute;
        left: 0;
        top: 0;
        width: ${widthPx}px;
        height: ${heightPx}px;
        transform: scale(${Number(calibracion.scale) || 1});
        transform-origin: ${(Number(calibracion.offset_x) || 0) * -1}px ${(Number(calibracion.offset_y) || 0) * -1}px;
    }
</style>
</head>
<body>
${pagesHtml}
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

        this._openPrintWindow(html);
    },

    _openPrintWindow(html) {
        const win = window.open('', '_blank', 'width=800,height=500');
        if (!win) {
            alert('Permita ventanas emergentes para imprimir.');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
    },
};

export default PrintEngine;
