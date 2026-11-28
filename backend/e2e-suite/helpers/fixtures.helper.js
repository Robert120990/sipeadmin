'use strict';

/**
 * Shared E2E fixtures: real magic-byte binary payloads (WebP, PNG, JPEG, PDF),
 * corrupt/spoofed payloads, large payload generators, and minimal DOM/File stubs
 * to execute ESM frontend modules (`receiptCompressor.js`) inside Node 24.
 */

// Valid minimal VP8L WebP image (1x1 transparent pixel) with RIFF + WEBP magic bytes
const VALID_WEBP_BUFFER = Buffer.from(
    '524946461a000000574542505650384c0d0000002f00000010071011118888fe0700',
    'hex'
);
const VALID_WEBP_DATA_URL = `data:image/webp;base64,${VALID_WEBP_BUFFER.toString('base64')}`;

// Valid minimal 1x1 PNG image (0x89 0x50 0x4E 0x47 ...)
const VALID_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c6360606060000000050001a5f645400000000049454e44ae426082',
    'hex'
);
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BUFFER.toString('base64')}`;

// Valid minimal JPEG header + EOI (0xFF 0xD8 ... 0xFF 0xD9)
const VALID_JPEG_BUFFER = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb00430003020202020203020202' +
    '0303030304060404040404080606050609080a0a090809090a0c0f0c0a0b0e0b09090d' +
    '110d0e0f101011100a0c12131210130f101010ffc0000b080001000101011100ffc400' +
    '14000100000000000000000000000000000009ffda0008010100003f00d2cf20ffd9',
    'hex'
);
const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${VALID_JPEG_BUFFER.toString('base64')}`;

// Valid minimal PDF (%PDF-1.4 ...)
const VALID_PDF_BUFFER = Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000112 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n182\n%%EOF\n',
    'utf8'
);
const VALID_PDF_DATA_URL = `data:application/pdf;base64,${VALID_PDF_BUFFER.toString('base64')}`;

// Spoofed / invalid payloads for adversarial / Tier 2 verification
const SPOOFED_WEBP_WITH_PNG_BYTES = `data:image/webp;base64,${VALID_PNG_BUFFER.toString('base64')}`;
const SPOOFED_PDF_WITH_TEXT = `data:application/pdf;base64,${Buffer.from('NOT A REAL PDF DOCUMENT').toString('base64')}`;
const HTML_DATA_URL = `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}`;
const EMPTY_WEBP_DATA_URL = 'data:image/webp;base64,';

function makeSizedValidWebpDataUrl(rawSizeBytes) {
    const padLen = Math.max(0, rawSizeBytes - VALID_WEBP_BUFFER.length);
    const padded = Buffer.concat([VALID_WEBP_BUFFER, Buffer.alloc(padLen, 0x41)]);
    return `data:image/webp;base64,${padded.toString('base64')}`;
}

function makeSizedValidPdfDataUrl(rawSizeBytes) {
    const padLen = Math.max(0, rawSizeBytes - VALID_PDF_BUFFER.length);
    const padded = Buffer.concat([VALID_PDF_BUFFER, Buffer.alloc(padLen, 0x20)]);
    return `data:application/pdf;base64,${padded.toString('base64')}`;
}

function makeLargeString(targetBytes) {
    return 'X'.repeat(Math.max(1, targetBytes));
}

/**
 * Installs lightweight global FileReader, Image, and document stubs so
 * `frontend/src/utils/receiptCompressor.js` can run natively in Node 24.
 */
async function withMockBrowserDomForCompressor(fn) {
    const prevFileReader = global.FileReader;
    const prevImage = global.Image;
    const prevDocument = global.document;

    class MockFileReader {
        constructor() {
            this.onload = null;
            this.onerror = null;
            this.result = null;
        }

        readAsDataURL(file) {
            setImmediate(() => {
                if (!file) {
                    if (this.onerror) this.onerror(new Error('Missing file'));
                    return;
                }
                if (file._dataUrl) {
                    this.result = file._dataUrl;
                } else if (file.type === 'application/pdf') {
                    this.result = VALID_PDF_DATA_URL;
                } else {
                    this.result = VALID_PNG_DATA_URL;
                }
                if (this.onload) {
                    this.onload({ target: { result: this.result } });
                }
            });
        }
    }

    class MockImage {
        constructor() {
            this.width = 1200;
            this.height = 900;
            this.onload = null;
            this.onerror = null;
            this._src = '';
        }

        set src(val) {
            this._src = val;
            setImmediate(() => {
                if (this.onload) this.onload();
            });
        }

        get src() {
            return this._src;
        }
    }

    const mockDocument = {
        createElement(tag) {
            if (tag !== 'canvas') return {};
            return {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high',
                        fillStyle: '#ffffff',
                        fillRect() {},
                        drawImage() {}
                    };
                },
                toDataURL(mime) {
                    if (mime === 'image/webp') return VALID_WEBP_DATA_URL;
                    return VALID_JPEG_DATA_URL;
                }
            };
        }
    };

    global.FileReader = MockFileReader;
    global.Image = MockImage;
    global.document = mockDocument;

    try {
        return await fn();
    } finally {
        global.FileReader = prevFileReader;
        global.Image = prevImage;
        global.document = prevDocument;
    }
}

module.exports = {
    VALID_WEBP_BUFFER,
    VALID_WEBP_DATA_URL,
    VALID_PNG_BUFFER,
    VALID_PNG_DATA_URL,
    VALID_JPEG_BUFFER,
    VALID_JPEG_DATA_URL,
    VALID_PDF_BUFFER,
    VALID_PDF_DATA_URL,
    SPOOFED_WEBP_WITH_PNG_BYTES,
    SPOOFED_PDF_WITH_TEXT,
    HTML_DATA_URL,
    SVG_DATA_URL,
    EMPTY_WEBP_DATA_URL,
    makeSizedValidWebpDataUrl,
    makeSizedValidPdfDataUrl,
    makeLargeString,
    withMockBrowserDomForCompressor
};
