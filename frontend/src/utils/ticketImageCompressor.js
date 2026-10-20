/**
 * Comprime cualquier imagen (File, Blob o DataURL) a formato WebP ligero.
 */
export const compressTicketImage = (source, { maxWidth = 1440, quality = 0.78 } = {}) => {
    return new Promise((resolve) => {
        if (!source) return resolve(null);

        const processDataUrl = (dataUrl) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(img.width * ratio));
                    canvas.height = Math.max(1, Math.round(img.height * ratio));
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    let webp = canvas.toDataURL('image/webp', quality);
                    if (!webp || !webp.startsWith('data:image/webp')) {
                        webp = canvas.toDataURL('image/jpeg', quality);
                    }
                    resolve(webp);
                } catch {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        };

        if (typeof source === 'string') {
            return processDataUrl(source);
        }

        if (source instanceof Blob || source instanceof File) {
            const reader = new FileReader();
            reader.onload = (ev) => processDataUrl(ev.target?.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(source);
            return;
        }

        resolve(null);
    });
};
