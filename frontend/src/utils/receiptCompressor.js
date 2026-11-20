/**
 * Compresor inteligente de comprobantes de pago (imágenes a WebP de alta legibilidad + soporte PDF).
 * Mantiene texto pequeño (números de referencia, montos, DTE, vouchers) completamente nítido
 * reduciendo archivos de 3-8 MB a ~90-200 KB.
 */

export const formatBytes = (bytes = 0) => {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const estimateBase64Bytes = (dataUrl = '') => {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return 0;
    const base64 = dataUrl.slice(commaIdx + 1);
    return Math.round((base64.length * 3) / 4);
};

export const compressReceiptFile = (file, options = {}) => {
    const {
        maxWidth = 1600,
        maxHeight = 2200,
        initialQuality = 0.84,
        minQuality = 0.72,
        targetMaxBytes = 420 * 1024,
        maxPdfBytes = 8 * 1024 * 1024
    } = options;

    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error('No se seleccionó ningún archivo'));
        }

        const originalName = file.name || `comprobante_${Date.now()}.webp`;
        const originalSize = file.size || 0;
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(originalName);

        if (isPdf) {
            if (originalSize > maxPdfBytes) {
                return reject(new Error(`El PDF "${originalName}" supera el límite de 8 MB`));
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target?.result;
                if (!dataUrl || !String(dataUrl).startsWith('data:application/pdf')) {
                    return reject(new Error('No se pudo leer el archivo PDF'));
                }
                resolve({
                    data_url: dataUrl,
                    mime_type: 'application/pdf',
                    nombre_original: originalName,
                    original_size: originalSize,
                    compressed_size: originalSize,
                    ancho: null,
                    alto: null
                });
            };
            reader.onerror = () => reject(new Error('Error leyendo archivo PDF'));
            reader.readAsDataURL(file);
            return;
        }

        if (file.type && !file.type.startsWith('image/')) {
            return reject(new Error(`Tipo de archivo no soportado (${file.type}). Use imagen o PDF.`));
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'));
        reader.onload = (ev) => {
            const rawDataUrl = ev.target?.result;
            const img = new Image();
            img.onerror = () => reject(new Error(`No se pudo procesar la imagen "${originalName}"`));
            img.onload = () => {
                try {
                    const widthRatio = img.width > maxWidth ? maxWidth / img.width : 1;
                    const heightRatio = img.height > maxHeight ? maxHeight / img.height : 1;
                    const ratio = Math.min(widthRatio, heightRatio, 1);

                    const targetW = Math.max(1, Math.round(img.width * ratio));
                    const targetH = Math.max(1, Math.round(img.height * ratio));

                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    // Fondo blanco por si la captura PNG tiene transparencia
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, targetW, targetH);
                    ctx.drawImage(img, 0, 0, targetW, targetH);

                    let quality = initialQuality;
                    let mime = 'image/webp';
                    let outUrl = canvas.toDataURL('image/webp', quality);
                    if (!outUrl || !outUrl.startsWith('data:image/webp')) {
                        mime = 'image/jpeg';
                        outUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    let outBytes = estimateBase64Bytes(outUrl);
                    // Ajuste suave solo si excede el objetivo, sin bajar de minQuality para mantener texto nítido
                    while (outBytes > targetMaxBytes && quality > minQuality) {
                        quality = Math.max(minQuality, Number((quality - 0.05).toFixed(2)));
                        outUrl = canvas.toDataURL(mime, quality);
                        outBytes = estimateBase64Bytes(outUrl);
                    }

                    const baseName = originalName.replace(/\.[^.]+$/, '');
                    const finalExt = mime === 'image/webp' ? 'webp' : 'jpg';

                    resolve({
                        data_url: outUrl,
                        mime_type: mime,
                        nombre_original: `${baseName}.${finalExt}`,
                        original_size: originalSize || estimateBase64Bytes(rawDataUrl),
                        compressed_size: outBytes,
                        ancho: targetW,
                        alto: targetH
                    });
                } catch (err) {
                    reject(err);
                }
            };
            img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
    });
};
