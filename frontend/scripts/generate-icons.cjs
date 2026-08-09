// Genera los iconos PWA (PNG puro, sin dependencias) replicando el diseño de
// public/favicon.svg: rectángulo redondeado azul (#2563eb) con "S" blanca.
// Uso: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '../public/icons');

// ── PNG helpers ──────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePNG(file, size, pixelFn) {
    const stride = size * 4 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0; // filter: none
        for (let x = 0; x < size; x++) {
            const [r, g, b, a] = pixelFn(x, y);
            const o = y * stride + 1 + x * 4;
            raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    console.log('✓', path.relative(process.cwd(), file));
}

// ── Diseño: réplica de favicon.svg — rectángulo redondeado azul + "S" blanca ──
const BG = [37, 99, 235];        // #2563eb
const WHITE = [255, 255, 255];
const CORNER_RADIUS = 6 / 32;    // rx del favicon.svg (6/32 del lienzo)

// Bitmap 5x7 de la letra "S"
const S_ROWS = [
    '01110',
    '10001',
    '10000',
    '01110',
    '00001',
    '10001',
    '01110',
];

function makeIcon(size, { rounded = true, letterScale = 0.5 } = {}) {
    const SAMPLE = 4; // supermuestreo 4x4 para suavizar bordes y letra
    const corner = size * CORNER_RADIUS;
    const cellW = (size * letterScale) / 5;
    const cellH = (size * letterScale) / 7;
    const ox = (size - cellW * 5) / 2;
    const oy = (size - cellH * 7) / 2;

    const subPixel = (sx, sy) => {
        if (rounded) {
            // rectángulo redondeado (esquinas rellenas de azul, sin transparencia)
            const cx = Math.min(Math.max(sx, corner), size - 1 - corner);
            const cy = Math.min(Math.max(sy, corner), size - 1 - corner);
            const dx = sx - cx;
            const dy = sy - cy;
            if (dx * dx + dy * dy > corner * corner) return [...BG, 255];
        }
        const col = Math.floor((sx - ox) / cellW);
        const row = Math.floor((sy - oy) / cellH);
        return S_ROWS[row]?.[col] === '1' ? [...WHITE, 255] : [...BG, 255];
    };

    return (x, y) => {
        let rsum = 0;
        let gsum = 0;
        let bsum = 0;
        for (let j = 0; j < SAMPLE; j++) {
            for (let i = 0; i < SAMPLE; i++) {
                const [sr, sg, sb] = subPixel(x + (i + 0.5) / SAMPLE, y + (j + 0.5) / SAMPLE);
                rsum += sr;
                gsum += sg;
                bsum += sb;
            }
        }
        const n = SAMPLE * SAMPLE;
        return [Math.round(rsum / n), Math.round(gsum / n), Math.round(bsum / n), 255];
    };
}

writePNG(path.join(OUT_DIR, 'icon-192.png'), 192, makeIcon(192));
writePNG(path.join(OUT_DIR, 'icon-512.png'), 512, makeIcon(512));
writePNG(path.join(OUT_DIR, 'icon-maskable-512.png'), 512, makeIcon(512, { rounded: false, letterScale: 0.42 }));
writePNG(path.join(OUT_DIR, 'apple-touch-icon.png'), 180, makeIcon(180));
console.log('Iconos generados en public/icons/');
