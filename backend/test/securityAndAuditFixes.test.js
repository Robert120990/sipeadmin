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
const { getRentabilidadPorEstacion, TAX_DEFAULTS } = require('../services/profitabilityService');
const { GEMINI_FALLBACK_MODELS, isGeminiApiKeyInvalidError } = require('../services/telegramGeminiService');
const { isTransientPuppeteerError, safePageEvaluate } = require('../services/energyLatamService');
const dbModule = require('../db');
const solarEnergyService = require('../services/solarEnergyService');

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
                // Simular req de Express 5 donde req.path es getter de solo lectura
                const req = { baseUrl: '/api/uploads', query: {}, headers: {} };
                Object.defineProperty(req, 'path', { get: () => testPath, enumerable: true });
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

    describe('5. Toggle de Impuestos P&L (IVA 13%, FOVIAL $0.20, COTRANS $0.10)', () => {
        it('descuenta impuestos de combustible, tienda (DTE) y lubricantes cuando excluirImpuestos=true', async () => {
            const origAcc = dbModule.getAccountingDb;
            const origDb = dbModule.getDb;
            const origRetry = dbModule.withRetry;
            const origSolar = solarEnergyService.getSolarAhorroRango;

            try {
                dbModule.withRetry = async (fn) => fn();
                solarEnergyService.getSolarAhorroRango = async () => ({ desglose_por_estacion: [] });
                dbModule.getAccountingDb = async () => ({
                    query: async (sql) => {
                        if (sql.includes('venta_dolares')) {
                            // 10,000 gal a $4.82 PVP -> $48,200 bruto
                            // FOVIAL=$2,000, COTRANS=$1,000 -> baseConIva=$45,200 -> neto=$40,000, IVA=$5,200
                            return [[{
                                id_empresa: 1,
                                total_galones: 10000,
                                venta_dolares: 48200,
                                galones_diesel: 10000,
                                galones_regular: 0,
                                galones_super: 0,
                                galones_ion: 0
                            }]];
                        }
                        if (sql.includes('FROM branches WHERE id !=')) {
                            return [[{ id_empresa: 1, titulo: 'Puma La Loma' }]];
                        }
                        if (sql.includes('FROM sales_headers')) {
                            return [[{
                                id_empresa: 1,
                                total_tienda: 1130,
                                impuestos_tienda: 130,
                                total_tienda_neto: 1000
                            }]];
                        }
                        if (sql.includes('gas_station_closeout_lubricant_readings')) {
                            return [[{ id_empresa: 1, total_lubricantes: 1130 }]];
                        }
                        if (sql.includes('gas_station_closeout_expenses')) {
                            return [[{ id_empresa: 1, total_gastos: 0 }]];
                        }
                        return [[]];
                    }
                });
                dbModule.getDb = () => ({
                    query: async (sql) => {
                        if (sql.includes('combustible_fletes_estacion')) {
                            return [[{ id_estacion: '014', flete_galon: 0.05 }]];
                        }
                        if (sql.includes('combustible_precios_estacion_quincenal')) {
                            return [[{ id_estacion: '014', precio_diesel: 3.70, precio_regular: 3.70, precio_super: 3.90, precio_ion: 3.80 }]];
                        }
                        return [[]];
                    }
                });

                const pnlBruto = await getRentabilidadPorEstacion('2026-10-15', '2026-11-13', { excluirImpuestos: false });
                const pnlNeto = await getRentabilidadPorEstacion('2026-10-15', '2026-11-13', { excluirImpuestos: true });

                assert.strictEqual(TAX_DEFAULTS.fovialPerGallon, 0.20);
                assert.strictEqual(TAX_DEFAULTS.cotransPerGallon, 0.10);
                assert.strictEqual(pnlBruto.excluir_impuestos, false);
                assert.strictEqual(pnlNeto.excluir_impuestos, true);

                // Combustible neto: $40,000 vs bruto $48,200 (impuestos = $8,200)
                assert.strictEqual(pnlBruto.estaciones[0].ingresos.combustible, 48200);
                assert.strictEqual(pnlNeto.estaciones[0].ingresos.combustible, 40000);
                // Tienda neta: $1,000 vs bruta $1,130; Lubricantes neto: $1,000 vs bruto $1,130
                assert.strictEqual(pnlNeto.estaciones[0].ingresos.tienda, 1000);
                assert.strictEqual(pnlNeto.estaciones[0].ingresos.lubricantes, 1000);
                // Margen combustible neto = $40,000 - $37,000 (costo) - $500 (flete) = $2,500
                assert.strictEqual(pnlNeto.estaciones[0].margenes_brutos.combustible, 2500);
                assert.strictEqual(pnlNeto.resumen_consolidado.desglose_impuestos.fovial_usd, 2000);
                assert.strictEqual(pnlNeto.resumen_consolidado.desglose_impuestos.cotrans_usd, 1000);
                assert.strictEqual(pnlNeto.resumen_consolidado.desglose_impuestos.iva_combustible_usd, 5200);
                assert.strictEqual(pnlNeto.resumen_consolidado.desglose_impuestos.impuestos_tienda_usd, 130);
                assert.strictEqual(pnlNeto.resumen_consolidado.desglose_impuestos.iva_lubricantes_usd, 130);
                assert.strictEqual(pnlNeto.resumen_consolidado.impuestos_descontados_total_usd, 8460);
            } finally {
                dbModule.getAccountingDb = origAcc;
                dbModule.getDb = origDb;
                dbModule.withRetry = origRetry;
                solarEnergyService.getSolarAhorroRango = origSolar;
            }
        });
    });

    describe('6. Resiliencia Gemini OCR y Scraper Puppeteer Energy Latam', () => {
        it('prioriza modelos Flash activos verificados (sin gemini-2.0-flash retirado)', () => {
            assert.strictEqual(GEMINI_FALLBACK_MODELS[0], 'gemini-2.5-flash-lite');
            assert.ok(!GEMINI_FALLBACK_MODELS.includes('gemini-2.0-flash'));
            assert.strictEqual(isGeminiApiKeyInvalidError(new Error('API_KEY_INVALID')), true);
            assert.strictEqual(isGeminiApiKeyInvalidError(new Error('503 Service Unavailable')), false);
        });

        it('detecta errores transitorios de Puppeteer y reintenta safePageEvaluate automáticamente', async () => {
            assert.strictEqual(isTransientPuppeteerError(new Error('Attempted to use detached Frame')), true);
            assert.strictEqual(isTransientPuppeteerError(new Error('Protocol error: Target closed')), true);
            assert.strictEqual(isTransientPuppeteerError(new Error('Execution context was destroyed')), true);
            assert.strictEqual(isTransientPuppeteerError(new Error('Credenciales inválidas')), false);

            let calls = 0;
            const fakePage = {
                isClosed: () => false,
                evaluate: async () => {
                    calls += 1;
                    if (calls === 1) throw new Error('Attempted to use detached Frame');
                    return { ok: true, attempt: calls };
                }
            };
            const res = await safePageEvaluate(fakePage, () => ({}));
            assert.deepStrictEqual(res, { ok: true, attempt: 2 });
        });
    });
});
