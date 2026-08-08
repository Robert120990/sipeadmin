// Genera iconos PWA placeholder (PNG puro, sin dependencias).
// Reemplaza public/icons/*.png con tus iconos oficiales cuando estén listos.
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

// ── Diseño: fondo azul (#2563eb), círculo blanco, letra "S" azul ────────────
const BG = [37, 99, 235];        // #2563eb
const WHITE = [255, 255, 255];
const LETTER = [37, 99, 235];    // #2563eb

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

function makeIcon(size, radiusRatio) {
    return (x, y) => {
        const cx = (size - 1) / 2;
        const cy = (size - 1) / 2;
        const r = (size / 2) * radiusRatio;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) return [...BG, 255];

        // celda de la letra dentro del círculo
        const cellW = (r * 2) / 5;
        const cellH = (r * 2) / 7;
        const col = Math.floor((x - (cx - r)) / cellW);
        const row = Math.floor((y - (cy - r)) / cellH);
        const cell = S_ROWS[row]?.[col];
        const inset = 0.15;
        const insideCell = Math.min(
            ((x - (cx - r)) % cellW) / cellW,
            ((y - (cy - r)) % cellH) / cellH,
        ) >= inset;
        if (cell === '1' && insideCell) return [...LETTER, 255];
        return [...WHITE, 255];
    };
}

writePNG(path.join(OUT_DIR, 'icon-192.png'), 192, makeIcon(192, 0.46));
writePNG(path.join(OUT_DIR, 'icon-512.png'), 512, makeIcon(512, 0.46));
writePNG(path.join(OUT_DIR, 'icon-maskable-512.png'), 512, makeIcon(512, 0.40));
writePNG(path.join(OUT_DIR, 'apple-touch-icon.png'), 180, makeIcon(180, 0.46));
console.log('Iconos generados en public/icons/');
