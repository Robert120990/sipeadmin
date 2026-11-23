const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
    signUploadUrl,
    normalizeUploadSubpath,
    guardProtectedUploadsMiddleware
} = require('../utils/uploadSigner');
const {
    getElSalvadorTodayYMD,
    formatDateYMD,
    addDaysYMD,
    formatDisplayDMY
} = require('../utils/dateSv');
const { saveBase64Screenshot, UPLOADS_DIR } = require('../services/ticketService');
const { computePaymentBalance } = require('../services/recordatoriosPagosService');
const { calcularEstadoPagoDte } = require('../services/creditRiskService');

describe('Security & Audit Regression Suite', () => {
    describe('1. Protected Uploads Path Normalization & Bypass Guard', () => {
        const makeRes = () => ({
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; }
        });

        it('normaliza variantes URL-encoded, dobles barras y segmentos relativos', () => {
            assert.strictEqual(normalizeUploadSubpath('/%70agos/recibo.webp'), '/pagos/recibo.webp');
            assert.strictEqual(normalizeUploadSubpath('/%2570agos/recibo.webp'), '/pagos/recibo.webp');
            assert.strictEqual(normalizeUploadSubpath('//pagos//recibo.webp'), '/pagos/recibo.webp');
            assert.strictEqual(normalizeUploadSubpath('/./pagos/recibo.webp'), '/pagos/recibo.webp');
            assert.strictEqual(normalizeUploadSubpath('/pagos%2frecibo.webp'), '/pagos/recibo.webp');
            assert.strictEqual(normalizeUploadSubpath('/pagos/../secret.txt'), null);
        });

        it('bloquea con 401 variantes codificadas de /api/uploads/pagos sin firma ni JWT', () => {
            const bypassPaths = [
                '/%70agos/recibo.webp',
                '/%2570agos/recibo.webp',
                '//pagos/recibo.webp',
                '/./pagos/recibo.webp',
                '/pagos%2frecibo.webp',
                '/PAGOS/recibo.webp'
            ];

            for (const testPath of bypassPaths) {
                const req = { baseUrl: '/api/uploads', path: testPath, query: {}, headers: {} };
                const res = makeRes();
                let nextCalled = false;
                guardProtectedUploadsMiddleware(req, res, () => { nextCalled = true; });
                assert.strictEqual(nextCalled, false, `No debió permitir bypass en ${testPath}`);
                assert.strictEqual(res.statusCode, 401, `Debió responder 401 en ${testPath}`);
            }
        });

        it('permite /api/uploads/pagos cuando cuenta con firma HMAC válida y permite otras rutas no protegidas', () => {
            const signed = signUploadUrl('/api/uploads/pagos/test-recibo.webp', 300);
            const urlObj = new URL(`https://admin.sipesv.com${signed}`);
            const reqSigned = {
                baseUrl: '/api/uploads',
                path: '/pagos/test-recibo.webp',
                query: {
                    exp: urlObj.searchParams.get('exp'),
                    sig: urlObj.searchParams.get('sig')
                },
                headers: {}
            };
            const resSigned = makeRes();
            let nextSigned = false;
            guardProtectedUploadsMiddleware(reqSigned, resSigned, () => { nextSigned = true; });
            assert.strictEqual(nextSigned, true);
            assert.strictEqual(resSigned.statusCode, 200);

            const reqPublic = { baseUrl: '/api/uploads', path: '/tickets/img.png', query: {}, headers: {} };
            const resPublic = makeRes();
            let nextPublic = false;
            guardProtectedUploadsMiddleware(reqPublic, resPublic, () => { nextPublic = true; });
            assert.strictEqual(nextPublic, true);
        });
    });

    describe('2. Utilidades de Fecha El Salvador (dateSv)', () => {
        it('convierte Date UTC de mysql2 sin corrimiento de -1 día', () => {
            const mysqlUtcMidnight = new Date(Date.UTC(2026, 10, 15, 0, 0, 0));
            assert.strictEqual(formatDateYMD(mysqlUtcMidnight), '2026-11-15');
            assert.strictEqual(formatDisplayDMY(mysqlUtcMidnight), '15/11/2026');
            assert.strictEqual(formatDateYMD('15/11/2026'), '2026-11-15');
            assert.strictEqual(addDaysYMD('2026-11-15', -1), '2026-11-14');
            assert.strictEqual(addDaysYMD('2026-11-30', 1), '2026-12-01');
        });

        it('calcula hoy en America/El_Salvador correctamente después de las 18:00 SV (00:30 UTC)', () => {
            // 2026-11-24 00:30:00Z corresponde a 2026-11-23 18:30:00 en El Salvador (UTC-6)
            const lateEveningSv = new Date('2026-11-24T00:30:00.000Z');
            assert.strictEqual(getElSalvadorTodayYMD(lateEveningSv), '2026-11-23');
        });
    });

    describe('3. Validación de Magic Bytes y URLs en Screenshots de Tickets', () => {
        it('rechaza payloads no-imagen disfrazados de PNG y URLs http externas', () => {
            const fakeHtml = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
            assert.throws(() => saveBase64Screenshot(fakeHtml, 'TEST-audit'), /no corresponde a una imagen válida/i);
            assert.throws(() => saveBase64Screenshot('https://evil.example/payload.png', 'TEST-audit'), /Formato de imagen no permitido/i);
            assert.throws(() => saveBase64Screenshot('/api/uploads/../secret.env', 'TEST-audit'), /Ruta de adjunto inválida/i);
            assert.strictEqual(saveBase64Screenshot('/api/uploads/valid.png', 'TEST-audit'), '/api/uploads/valid.png');
        });

        it('acepta imagen PNG válida (magic bytes reales) y guarda archivo en disco', () => {
            const validPngBytes = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
            ]);
            const dataUrl = `data:image/png;base64,${validPngBytes.toString('base64')}`;
            const savedUrl = saveBase64Screenshot(dataUrl, 'TEST-audit');
            assert.ok(savedUrl && savedUrl.startsWith('/api/uploads/'));
            const filename = path.basename(savedUrl);
            const absPath = path.join(UPLOADS_DIR, filename);
            assert.ok(fs.existsSync(absPath));
            try { fs.unlinkSync(absPath); } catch (_) { /* cleanup */ }
        });
    });

    describe('4. Integridad de Recordatorios y Crédito (Contado vs Crédito)', () => {
        it('computePaymentBalance normaliza fecha_pago Date de mysql2 sin corrupción de string', () => {
            const balance = computePaymentBalance(100, [
                { monto: 40, fecha_pago: new Date(Date.UTC(2026, 10, 10, 0, 0, 0)) }
            ], 'P');

            assert.strictEqual(balance.estado_pago, 'PARCIAL');
            assert.strictEqual(balance.saldo_pendiente, 60);
            assert.strictEqual(balance.ultima_fecha_pago, '2026-11-10');
        });

        it('calcularEstadoPagoDte asigna saldo 0 y estado PAGADO_CONTADO a facturas de Contado', () => {
            const dteContado = calcularEstadoPagoDte({
                total_pagar: 250.5,
                abonado_dte: 0,
                condicion_operacion: 1,
                dias_mora: 0
            });
            assert.strictEqual(dteContado.estado_pago, 'PAGADO_CONTADO');
            assert.strictEqual(dteContado.saldo_pendiente, 0);
        });
    });
});
