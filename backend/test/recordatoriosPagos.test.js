const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    PAYMENT_METHODS,
    normalizeMetodoPago,
    normalizeTipoOperacion,
    computePaymentBalance,
    buildLegacyFormaPagoSummary,
    extractDescriptionKeywords,
    matchHistoricalFormaPago,
    parseReceiptDataUrl,
    readSavedReceiptAsBuffer,
    saveReceiptBase64,
    deleteReceiptFile,
    sanitizeIsoDate,
    matchExtractedReceiptToCatalog,
    PAGOS_UPLOADS_DIR
} = require('../services/recordatoriosPagosService');

describe('Control de Pagos Avanzado: Abonos Parciales, Sugerencias Inteligentes y Comprobantes', () => {
    describe('1. Catálogo y Normalización de Métodos de Pago y Tipo de Operación', () => {
        it('debe incluir todos los tipos de pago requeridos (Transferencia, Tarjeta, Efectivo, NC, Remisión, Cheque, etc.)', () => {
            const ids = PAYMENT_METHODS.map(m => m.id);
            for (const reqId of [
                'TRANSFERENCIA', 'CHEQUE', 'TARJETA_CREDITO', 'TARJETA_DEBITO',
                'EFECTIVO', 'NOTA_CREDITO', 'REMISION', 'DEBITO_AUTOMATICO', 'DEPOSITO', 'COMPENSACION'
            ]) {
                assert.ok(ids.includes(reqId), `Falta el método de pago ${reqId}`);
            }
        });

        it('debe normalizar variantes en español hacia los códigos oficiales', () => {
            assert.equal(normalizeMetodoPago('Tarjeta de Crédito'), 'TARJETA_CREDITO');
            assert.equal(normalizeMetodoPago('TC DAVI #8833'), 'TARJETA_CREDITO');
            assert.equal(normalizeMetodoPago('Tarjeta de Débito'), 'TARJETA_DEBITO');
            assert.equal(normalizeMetodoPago('Nota de Crédito'), 'NOTA_CREDITO');
            assert.equal(normalizeMetodoPago('Remisión'), 'REMISION');
            assert.equal(normalizeMetodoPago('Caja Chica Efectivo'), 'EFECTIVO');
            assert.equal(normalizeMetodoPago('Cheque #402'), 'CHEQUE');
        });

        it('debe usar CXP por defecto y aceptar CXC y GASTO', () => {
            assert.equal(normalizeTipoOperacion(''), 'CXP');
            assert.equal(normalizeTipoOperacion('cxc'), 'CXC');
            assert.equal(normalizeTipoOperacion('GASTO'), 'GASTO');
            assert.equal(normalizeTipoOperacion('DESCONOCIDO'), 'CXP');
        });
    });

    describe('2. Cálculo de Saldos Parciales y Múltiples Abonos', () => {
        it('debe mantener PENDIENTE y legacy P cuando un trabajo lleva 50% de anticipo', () => {
            const bal = computePaymentBalance(1000, [
                { monto: 500, fecha_pago: '2026-11-20', metodo_pago: 'TRANSFERENCIA' }
            ], 'P');

            assert.equal(bal.monto_total, 1000);
            assert.equal(bal.monto_pagado, 500);
            assert.equal(bal.saldo_pendiente, 500);
            assert.equal(bal.porcentaje_pagado, 50);
            assert.equal(bal.estado_pago, 'PARCIAL');
            assert.equal(bal.legacy_estado, 'P');
            assert.equal(bal.abonos_count, 1);
        });

        it('debe pasar a CANCELADO y legacy C al completar 100% con múltiples abonos combinados', () => {
            const bal = computePaymentBalance(1250.50, [
                { monto: 500.00, fecha_pago: '2026-11-10', metodo_pago: 'TRANSFERENCIA' },
                { monto: 350.50, fecha_pago: '2026-11-15', metodo_pago: 'TARJETA_CREDITO' },
                { monto: 400.00, fecha_pago: '2026-11-20', metodo_pago: 'EFECTIVO' }
            ], 'P');

            assert.equal(bal.monto_pagado, 1250.50);
            assert.equal(bal.saldo_pendiente, 0);
            assert.equal(bal.porcentaje_pagado, 100);
            assert.equal(bal.estado_pago, 'CANCELADO');
            assert.equal(bal.legacy_estado, 'C');
            assert.equal(bal.ultima_fecha_pago, '2026-11-20');
        });

        it('debe preservar registros legacy CANCELADO sin abonos registrados', () => {
            const bal = computePaymentBalance(800, [], 'C');
            assert.equal(bal.estado_pago, 'CANCELADO');
            assert.equal(bal.monto_pagado, 800);
            assert.equal(bal.saldo_pendiente, 0);
        });

        it('debe construir resúmenes <= 50 caracteres para web_rc_recordatorios_vencimientos.forma_pago', () => {
            const abonos = [
                { metodo_pago: 'TRANSFERENCIA', cuenta_label: '[BAC] ANDELSA - CTA CTE - (201002367)' },
                { metodo_pago: 'NOTA_CREDITO', referencia_doc: 'NC-001' }
            ];
            const bal = computePaymentBalance(1000, [{ monto: 500, fecha_pago: '2026-11-20' }], 'P');
            const summary = buildLegacyFormaPagoSummary(abonos, bal);
            assert.ok(summary.length <= 50, `Resumen excede 50 chars: ${summary}`);
            assert.ok(summary.includes('PARC 50%'));
            assert.ok(summary.includes('TRANSF+NC'));
        });
    });

    describe('3. Motor de Sugerencias Inteligentes por Historial Real', () => {
        const mockCuentas = [
            { raw_id: 541, banco_nombre: 'PROMERICA', nombre: 'PISTA #1900 MIRAFLORES', numero: '10000033001900', empresa_nombre: 'INVERSIONES RRS' },
            { raw_id: 545, banco_nombre: 'AMERICA CENTRAL', nombre: 'BAC CORINA DE SOSA #4360', numero: '201034360', empresa_nombre: 'PERSONAL' },
            { raw_id: 601, banco_nombre: 'DAVIVIENDA', nombre: 'ANDELSA CTA CTE', numero: '002510128744', empresa_nombre: 'ANDELSA S.A. DE C.V.' }
        ];

        it('debe extraer palabras clave útiles filtrando conectores y números', () => {
            const kws = extractDescriptionKeywords('DTE 1385 PROMOTORA COMERCIAL DE PAGO');
            assert.ok(kws.includes('PROMOTORA'));
            assert.ok(kws.includes('COMERCIAL'));
            assert.ok(!kws.includes('DTE'));
            assert.ok(!kws.includes('PAGO'));
        });

        it('debe vincular códigos históricos (PROM#1900, DAVI ANDELSA, TC DAVI #8833) a cuentas y tarjetas reales', () => {
            const m1 = matchHistoricalFormaPago('PROM#1900', mockCuentas);
            assert.equal(m1.cuenta_bancaria_id, 541);
            assert.equal(m1.metodo_pago, 'TRANSFERENCIA');

            const m2 = matchHistoricalFormaPago('DAVI ANDELSA', mockCuentas);
            assert.equal(m2.cuenta_bancaria_id, 601);

            const m3 = matchHistoricalFormaPago('TC DAVI #8833', mockCuentas);
            assert.equal(m3.metodo_pago, 'TARJETA_CREDITO');
            assert.equal(m3.tarjeta_ref, 'TC DAVI #8833');
        });
    });

    describe('4. Almacenamiento Seguro y Validación de Comprobantes (WebP y PDF)', () => {
        it('debe guardar y eliminar correctamente un archivo WebP y un PDF válidos', () => {
            // Cabecera mínima válida RIFF....WEBP
            const fakeWebp = Buffer.from([
                0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
                0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
            ]);
            const webpRes = saveReceiptBase64({
                dataUrl: `data:image/webp;base64,${fakeWebp.toString('base64')}`,
                nombreOriginal: 'voucher_bac.webp',
                vencimientoId: 999999
            });
            assert.ok(webpRes.archivo_url.startsWith('/api/uploads/pagos/pago_999999_'));
            assert.equal(webpRes.mime_type, 'image/webp');
            const webpPath = path.join(PAGOS_UPLOADS_DIR, path.basename(webpRes.archivo_url));
            assert.ok(fs.existsSync(webpPath));
            deleteReceiptFile(webpRes.archivo_url);
            assert.ok(!fs.existsSync(webpPath));

            const fakePdf = Buffer.from('%PDF-1.4\n%EOF\n', 'ascii');
            const pdfRes = saveReceiptBase64({
                dataUrl: `data:application/pdf;base64,${fakePdf.toString('base64')}`,
                nombreOriginal: 'dte_factura.pdf',
                vencimientoId: 999999
            });
            assert.equal(pdfRes.mime_type, 'application/pdf');
            const pdfPath = path.join(PAGOS_UPLOADS_DIR, path.basename(pdfRes.archivo_url));
            assert.ok(fs.existsSync(pdfPath));
            deleteReceiptFile(pdfRes.archivo_url);
            assert.ok(!fs.existsSync(pdfPath));
        });

        it('debe rechazar comprobantes con firma falsa o tipo no soportado', () => {
            assert.throws(() => {
                saveReceiptBase64({
                    dataUrl: 'data:application/pdf;base64,' + Buffer.from('NOT_A_PDF').toString('base64'),
                    nombreOriginal: 'malicioso.pdf',
                    vencimientoId: 1
                });
            }, /firma válida/i);

            assert.throws(() => {
                saveReceiptBase64({
                    dataUrl: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'),
                    nombreOriginal: 'bad.html',
                    vencimientoId: 1
                });
            }, /no soportado/i);
        });
    });

    describe('5. Lectura Inteligente OCR (Cuenta, Monto, Beneficiario y Autocompletado)', () => {
        const mockAdminCuentas = [
            { raw_id: 541, banco_nombre: 'PROMERICA', nombre: 'PISTA #1900 MIRAFLORES', numero: '10000033001900', empresa_nombre: 'INVERSIONES RRS' },
            { raw_id: 583, banco_nombre: 'DAVIVIENDA', nombre: 'DAVIVIENDA AHORRO - SOSA CASTELLANOS', numero: '015541116587', empresa_nombre: 'ANDELSA S.A DE C.V' },
            { raw_id: 584, banco_nombre: 'DAVIVIENDA', nombre: 'BANCO DAVIVIENDA INV LIL', numero: '15510057325', empresa_nombre: 'INVERSIONES LIL' },
            { raw_id: 594, banco_nombre: 'AMERICA CENTRAL', nombre: 'ANDELSA - BAC CTA CTE', numero: '201002367', empresa_nombre: 'ANDELSA S.A DE C.V' }
        ];

        it('debe normalizar fechas ISO y DD/MM/YYYY y descartar inválidas', () => {
            assert.equal(sanitizeIsoDate('2026-11-20'), '2026-11-20');
            assert.equal(sanitizeIsoDate('20/11/2026'), '2026-11-20');
            assert.equal(sanitizeIsoDate('05-03-26'), '2026-03-05');
            assert.equal(sanitizeIsoDate('99/99/2026'), null);
            assert.equal(sanitizeIsoDate('texto invalido'), null);
        });

        it('debe emparejar cuenta bancaria por últimos 4 dígitos, leer beneficiario y detectar abono parcial 50%', () => {
            const matched = matchExtractedReceiptToCatalog({
                tipo_documento: 'Transferencia Bancaria',
                metodo_pago: 'TRANSFERENCIA',
                monto_usd: '$500.00',
                fecha: '20/11/2026',
                banco_origen: 'Davivienda',
                cuenta_origen: '****6587',
                beneficiario: 'PROMOTORA COMERCIAL S.A. DE C.V.',
                referencia: 'TRF-20261120-8841',
                concepto: 'Anticipo mantenimiento eléctrico'
            }, mockAdminCuentas, {
                ubicacion: 'ANDELSA',
                tipo_operacion: 'CXP',
                monto_total: 1000,
                saldo_pendiente: 1000
            });

            assert.equal(matched.metodo_pago, 'TRANSFERENCIA');
            assert.equal(matched.cuenta_bancaria_id, 583);
            assert.equal(matched.monto, 500);
            assert.equal(matched.fecha_pago, '2026-11-20');
            assert.equal(matched.beneficiario, 'PROMOTORA COMERCIAL S.A. DE C.V.');
            assert.equal(matched.referencia_doc, 'TRF-20261120-8841');
            assert.ok(matched.notas_sugeridas.includes('Abono parcial 50%'));
            assert.ok(matched.notas_sugeridas.includes('PROMOTORA COMERCIAL'));
        });

        it('debe emparejar por banco + contexto de ubicación cuando el comprobante no trae número de cuenta', () => {
            const matched = matchExtractedReceiptToCatalog({
                tipo_documento: 'Transferencia Bancaria',
                metodo_pago: 'TRANSFERENCIA',
                monto_usd: 250,
                fecha: '2026-11-20',
                banco_origen: 'Davivienda',
                beneficiario: 'PROVEEDOR INDUSTRIAL'
            }, mockAdminCuentas, {
                ubicacion: 'ANDELSA',
                tipo_operacion: 'CXP',
                monto_total: 250,
                saldo_pendiente: 250
            });

            assert.equal(matched.cuenta_bancaria_id, 583);
            assert.ok(matched.cuenta_match_reason.includes('ANDELSA'));
        });

        it('debe emparejar la cuenta BAC ANDELSA (201002367 / id 594) por número o por banco BAC + contexto ANDELSA', () => {
            const byNumber = matchExtractedReceiptToCatalog({
                tipo_documento: 'Transferencia Bancaria',
                metodo_pago: 'TRANSFERENCIA',
                monto_usd: 15800,
                fecha: '2026-11-20',
                banco_origen: 'BAC',
                cuenta_origen: '201002367',
                beneficiario: 'INVERSIONES AVICOLAS DE HONDUR'
            }, mockAdminCuentas, {
                ubicacion: 'ANDELSA',
                tipo_operacion: 'CXP',
                monto_total: 33300,
                saldo_pendiente: 15800
            });

            assert.equal(byNumber.cuenta_bancaria_id, 594);
            assert.ok(byNumber.cuenta_label.includes('201002367'));

            const byContext = matchExtractedReceiptToCatalog({
                tipo_documento: 'Transferencia Bancaria',
                metodo_pago: 'TRANSFERENCIA',
                monto_usd: 15800,
                fecha: '2026-11-20',
                banco_origen: 'BAC',
                beneficiario: 'INVERSIONES AVICOLAS DE HONDUR'
            }, mockAdminCuentas, {
                ubicacion: 'ANDELSA',
                tipo_operacion: 'CXP',
                monto_total: 33300,
                saldo_pendiente: 15800
            });

            assert.equal(byContext.cuenta_bancaria_id, 594);
        });

        it('debe clasificar correctamente vouchers de Tarjeta de Crédito y Notas de Crédito', () => {
            const tc = matchExtractedReceiptToCatalog({
                tipo_documento: 'Voucher Tarjeta Crédito',
                metodo_pago: 'TARJETA_CREDITO',
                monto_usd: 145.75,
                banco_origen: 'Davivienda',
                tarjeta_ultimos4: 'VISA 0038',
                beneficiario: 'FERRETERIA FREUND',
                referencia: 'AUTH-904412'
            }, mockAdminCuentas, { tipo_operacion: 'CXP' });

            assert.equal(tc.metodo_pago, 'TARJETA_CREDITO');
            assert.equal(tc.tarjeta_ref, 'TC DAVIVIENDA #0038');
            assert.equal(tc.cuenta_bancaria_id, null);

            const nc = matchExtractedReceiptToCatalog({
                tipo_documento: 'Nota de Crédito',
                metodo_pago: 'NOTA_CREDITO',
                monto_usd: 80,
                beneficiario: 'DISTRIBUIDORA SHELL',
                referencia: 'NC-000145'
            }, mockAdminCuentas, { tipo_operacion: 'CXP' });

            assert.equal(nc.metodo_pago, 'NOTA_CREDITO');
            assert.equal(nc.cuenta_bancaria_id, null);
        });
    });

    describe('6. Validaciones de Seguridad (Path Traversal, Rate Limit y Saneamiento)', () => {
        it('debe bloquear intentos de path traversal y extensiones peligrosas en readSavedReceiptAsBuffer', () => {
            assert.throws(() => readSavedReceiptAsBuffer('/api/uploads/pagos/../../.env'), /no encontrado|inválido|fuera|soportada/i);
            assert.throws(() => readSavedReceiptAsBuffer('/etc/passwd'), /inválida/i);
            assert.throws(() => readSavedReceiptAsBuffer('/api/uploads/pagos/shell.js'), /soportada|no encontrado/i);
            assert.throws(() => parseReceiptDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), /no soportado/i);
        });

        it('debe proteger el endpoint OCR con aiLimiter y soportar payloads de hasta 20MB en server.js', () => {
            const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
            assert.ok(serverSrc.includes("'/api/operaciones/recordatorios'"), 'Falta registrar /api/operaciones/recordatorios en largePayloadPrefixes');
            assert.ok(serverSrc.includes("app.use('/api/operaciones/recordatorios/analizar-comprobante', aiLimiter)"), 'Falta aiLimiter en analizar-comprobante');
        });
    });
});
