const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const dbModule = require('../db');
const consultasModule = require('../routes/consultas');
const {
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage,
    generateExecutiveReportPdf,
    sendTelegramDocument,
    handleIncomingMessage,
    handleCallbackQuery
} = require('../services/telegramBotService');

describe('Telegram Vision OCR (Receipts/Invoices) & Letter PDF Reports Tests', () => {
    let originalAxiosPost;
    let originalAxiosGet;
    let originalGeminiKey;
    let originalPoolQuery;
    let originalGetConsolidado;
    let sentMessages = [];
    let sentDocuments = [];
    let answeredCallbacks = [];

    beforeEach(() => {
        sentMessages = [];
        sentDocuments = [];
        answeredCallbacks = [];
        originalAxiosPost = axios.post;
        originalAxiosGet = axios.get;
        originalGeminiKey = process.env.GEMINI_API_KEY;
        originalGetConsolidado = consultasModule.getConsolidadoVentasData;

        consultasModule.getConsolidadoVentasData = async () => ({
            estaciones: [
                {
                    id: '008',
                    id_empresa: '008',
                    empresa: 'Puma Costa del Sol',
                    total_venta: 15400,
                    venta: 15400,
                    galones: 4500,
                    galonaje: 4500,
                    diesel: 2000,
                    regular: 1500,
                    super: 1000,
                    ion_diesel: 0
                }
            ],
            tiendas: [
                {
                    empresa: 'Super 7 Costa del Sol',
                    venta: 1200,
                    gastos: 50
                }
            ],
            resumen_cierre: [],
            cortes_tienda: []
        });

        const pool = dbModule.getDb();
        if (pool) {
            originalPoolQuery = pool.query;
            pool.query = async (sql, params = []) => {
                const sqlStr = String(sql).toLowerCase();

                if (sqlStr.includes('telegram_config')) {
                    return [[{ bot_token: 'MOCK_TOKEN', is_active: 1, gemini_api_key: process.env.GEMINI_API_KEY || '' }]];
                }

                if (sqlStr.includes('from telegram_usuarios') && sqlStr.includes('where telegram_user_id')) {
                    const uid = String(params[0] || '12345');
                    return [[{
                        id: 1,
                        telegram_user_id: uid,
                        telegram_username: '@station_mgr',
                        first_name: 'Gerente Puma',
                        last_name: 'SIPE',
                        activo: 1,
                        permiso_ventas: 1,
                        permiso_saldos_banco: 1,
                        permiso_saldos_chequera: 1,
                        permiso_alertas: 1
                    }]];
                }

                if (sqlStr.includes('from movimientos_bancarios')) {
                    const refParam = String(params[0] || '');
                    if (refParam === 'REF-998877') {
                        return [[{
                            id: 501,
                            referencia: 'REF-998877',
                            abono: 2450.75,
                            cargo: 0,
                            fecha: '2026-10-12',
                            cuenta_nombre: 'Cuenta Corriente Principal',
                            cuenta_numero: '500-123456-7',
                            banco_nombre: 'Banco Agrícola'
                        }]];
                    }
                    return [[]];
                }

                if (sqlStr.includes('insert into telegram_feedback')) {
                    return [{ insertId: 777 }];
                }

                return [[]];
            };
        }

        axios.post = async (url, data) => {
            const urlStr = String(url);
            if (urlStr.includes('/sendMessage')) {
                sentMessages.push(data);
                return { data: { ok: true, result: { message_id: 1001 } } };
            }
            if (urlStr.includes('/sendDocument')) {
                sentDocuments.push(data);
                return { data: { ok: true, result: { message_id: 2002, document: { file_name: data.filename || 'Reporte_SIPE.pdf' } } } };
            }
            if (urlStr.includes('/answerCallbackQuery')) {
                answeredCallbacks.push(data);
                return { data: { ok: true } };
            }
            return { data: { ok: true } };
        };

        axios.get = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/getFile')) {
                return { data: { ok: true, result: { file_path: 'photos/receipt_test.jpg' } } };
            }
            if (urlStr.includes('/file/bot')) {
                return { data: Buffer.from('FAKE_JPEG_IMAGE_BYTES_1234567890') };
            }
            return { data: { ok: true } };
        };
    });

    afterEach(() => {
        if (originalAxiosPost) axios.post = originalAxiosPost;
        if (originalAxiosGet) axios.get = originalAxiosGet;
        if (originalPoolQuery) {
            const pool = dbModule.getDb();
            if (pool) pool.query = originalPoolQuery;
        }
        if (originalGetConsolidado) {
            consultasModule.getConsolidadoVentasData = originalGetConsolidado;
        }
        if (originalGeminiKey !== undefined) {
            process.env.GEMINI_API_KEY = originalGeminiKey;
        } else {
            delete process.env.GEMINI_API_KEY;
        }
    });

    describe('1. OCR de Comprobantes Bancarios y Facturas (analyzeTelegramImageReceipt)', () => {
        it('debe rechazar buffers vacíos o inválidos', async () => {
            await assert.rejects(
                async () => analyzeTelegramImageReceipt(null),
                /Buffer de imagen inválido o vacío/
            );
            await assert.rejects(
                async () => analyzeTelegramImageReceipt(Buffer.from('')),
                /Buffer de imagen inválido o vacío/
            );
        });

        it('debe lanzar error descriptivo si GEMINI_API_KEY no está configurada', async () => {
            delete process.env.GEMINI_API_KEY;
            const imgBuf = Buffer.from('FAKE_IMAGE_DATA');
            await assert.rejects(
                async () => analyzeTelegramImageReceipt(imgBuf, 'image/jpeg'),
                /GEMINI_API_KEY no configurado/
            );
        });

        it('debe extraer campos estructurados JSON desde Gemini 2.0 Flash Vision', async () => {
            process.env.GEMINI_API_KEY = 'AIzaSyFakeVisionTestKey123456789';
            const genaiModule = require('@google/genai');
            const originalGoogleGenAI = genaiModule.GoogleGenAI;

            let capturedMime = null;
            genaiModule.GoogleGenAI = class MockGoogleGenAI {
                constructor() {
                    this.models = {
                        generateContent: async ({ contents }) => {
                            capturedMime = contents[0]?.parts?.[1]?.inlineData?.mimeType;
                            return {
                                text: JSON.stringify({
                                    tipo_documento: 'Remesa Bancaria',
                                    banco: 'Banco Agrícola',
                                    monto_usd: 2450.75,
                                    fecha: '2026-10-12',
                                    referencia: 'REF-998877',
                                    cuenta_destino: '500-123456-7',
                                    beneficiario: 'SIPE Combustibles S.A. de C.V.',
                                    concepto: 'Depósito cierre de turno Costa del Sol',
                                    observaciones: 'Sello de caja legible y sin alteraciones'
                                })
                            };
                        }
                    };
                }
            };

            try {
                const imgBuf = Buffer.from('JPEG_BINARY_CONTENT');
                const result = await analyzeTelegramImageReceipt(imgBuf, 'image/jpeg; charset=binary', 'Remesa Costa del Sol');

                assert.strictEqual(capturedMime, 'image/jpeg');
                assert.strictEqual(result.tipo_documento, 'Remesa Bancaria');
                assert.strictEqual(result.banco, 'Banco Agrícola');
                assert.strictEqual(result.monto_usd, 2450.75);
                assert.strictEqual(result.fecha, '2026-10-12');
                assert.strictEqual(result.referencia, 'REF-998877');
                assert.strictEqual(result.cuenta_destino, '500-123456-7');
            } finally {
                genaiModule.GoogleGenAI = originalGoogleGenAI;
            }
        });
    });

    describe('2. Verificación en Bancos y Formateo HTML (formatReceiptAnalysisMessage)', () => {
        it('debe formatear comprobante CONCILIADO en movimientos_bancarios con check verde', async () => {
            const analysis = {
                tipo_documento: 'Remesa Bancaria',
                banco: 'Banco Agrícola',
                monto_usd: 2450.75,
                fecha: '2026-10-12',
                referencia: 'REF-998877',
                cuenta_destino: '500-123456-7',
                beneficiario: 'SIPE Admin',
                concepto: 'Remesa venta diaria'
            };

            const verification = await verifyReceiptInBankMovements(analysis);
            const html = formatReceiptAnalysisMessage(analysis, verification);

            assert.ok(html.includes('📸'));
            assert.ok(html.includes('🏦'));
            assert.ok(html.includes('$2,450.75'));
            assert.ok(html.includes('REF-998877'));
            if (verification.found) {
                assert.ok(html.includes('✅'));
                assert.ok(html.includes('CONCILIADO'));
            }
        });

        it('debe formatear comprobante PENDIENTE cuando no existe en movimientos_bancarios', () => {
            const analysis = {
                tipo_documento: 'Comprobante de Transferencia',
                banco: 'Banco Promerica',
                monto_usd: 890.00,
                fecha: '2026-10-13',
                referencia: 'NO-EXISTE-001'
            };

            const html = formatReceiptAnalysisMessage(analysis, { checked: true, found: false, movement: null });
            assert.ok(html.includes('📸'));
            assert.ok(html.includes('Banco Promerica'));
            assert.ok(html.includes('$890.00'));
            assert.ok(html.includes('⚠️'));
            assert.ok(html.includes('PENDIENTE DE REGISTRO'));
        });
    });

    describe('3. Generación y Envío de Reportes PDF Tamaño Carta (LETTER)', () => {
        it('generateExecutiveReportPdf debe generar un Buffer PDF válido (%PDF-) en tamaño Carta', async () => {
            const pdfBuffer = await generateExecutiveReportPdf({
                title: 'REPORTE CONSOLIDADO DE VENTAS',
                subtitle: 'Estaciones de Servicio y Tiendas de Conveniencia',
                dateStr: '12/10/2026',
                kpis: [
                    { label: 'Galonaje Total', value: '4,500.00 gal' },
                    { label: 'Venta Total', value: '$16,600.00' }
                ],
                columns: ['Estación', 'Galones', 'Venta ($)'],
                rows: [
                    ['Puma Costa del Sol', '4,500.00 gal', '$15,400.00'],
                    ['Super 7 Costa del Sol', '-', '$1,200.00']
                ],
                summaryText: 'Resumen operativo diario en tamaño Carta.'
            });

            assert.ok(Buffer.isBuffer(pdfBuffer), 'Debe retornar un Buffer');
            assert.ok(pdfBuffer.length > 500, 'El PDF debe tener contenido real (>500 bytes)');
            const header = pdfBuffer.subarray(0, 5).toString('ascii');
            assert.strictEqual(header, '%PDF-', 'El archivo debe iniciar con la firma %PDF-');
        });

        it('sendTelegramDocument debe enviar el archivo PDF al endpoint /sendDocument de Telegram', async () => {
            const pdfBuffer = await generateExecutiveReportPdf({
                title: 'REPORTE SALDOS BANCOS',
                kpis: [{ label: 'Total Bancos', value: '$125,000.00' }],
                rows: [['Banco Agrícola', '500-123456-7', '$125,000.00']]
            });

            const res = await sendTelegramDocument(12345, pdfBuffer, 'Reporte_Bancos.pdf', '📄 <b>Reporte en PDF</b>');
            assert.ok(res);
            assert.strictEqual(sentDocuments.length, 1);
            assert.strictEqual(sentDocuments[0].filename, 'Reporte_Bancos.pdf');
            assert.ok(Buffer.isBuffer(sentDocuments[0].fileBuffer));
        });

        it('handleIncomingMessage debe procesar fotos (msg.photo) y comandos /pdf', async () => {
            process.env.GEMINI_API_KEY = 'AIzaSyFakeVisionTestKey123456789';
            const genaiModule = require('@google/genai');
            const originalGoogleGenAI = genaiModule.GoogleGenAI;

            genaiModule.GoogleGenAI = class MockGoogleGenAI {
                constructor() {
                    this.models = {
                        generateContent: async () => ({
                            text: JSON.stringify({
                                tipo_documento: 'Factura Comercial',
                                banco: 'BAC Credomatic',
                                monto_usd: 1500.00,
                                fecha: '2026-10-12',
                                referencia: 'FAC-2026-55',
                                beneficiario: 'Distribuidora El Salvador',
                                concepto: 'Suministros de estación'
                            })
                        })
                    };
                }
            };

            try {
                // 1. Prueba de recepción de foto en handleIncomingMessage
                await handleIncomingMessage({
                    chat: { id: 12345 },
                    from: { id: 12345, username: 'station_mgr', first_name: 'Gerente' },
                    photo: [
                        { file_id: 'small_photo_id', width: 320, height: 240 },
                        { file_id: 'high_res_photo_id', width: 1280, height: 960 }
                    ],
                    caption: 'Factura pagada con BAC'
                });

                assert.ok(sentMessages.length >= 2, 'Debe enviar aviso de progreso y resultado del análisis');
                const finalPhotoReply = sentMessages[sentMessages.length - 1];
                assert.ok(finalPhotoReply.text.includes('ANÁLISIS DE COMPROBANTE'));
                assert.ok(finalPhotoReply.text.includes('BAC Credomatic'));
                assert.ok(finalPhotoReply.text.includes('$1,500.00'));

                // 2. Prueba de solicitud de PDF por comando /pdf ventas
                await handleIncomingMessage({
                    chat: { id: 12345 },
                    from: { id: 12345, username: 'station_mgr', first_name: 'Gerente' },
                    text: '/pdf ventas'
                });

                assert.strictEqual(sentDocuments.length, 1, 'Debe haber enviado 1 documento PDF por comando');
                assert.ok(sentDocuments[0].filename.startsWith('Reporte_Ventas_'));

                // 3. Prueba de callback pdf_rep:ventas
                await handleCallbackQuery({
                    id: 'cq_pdf_1',
                    from: { id: 12345 },
                    message: { chat: { id: 12345 }, message_id: 99 },
                    data: 'pdf_rep:ventas'
                });

                assert.strictEqual(sentDocuments.length, 2, 'Debe haber enviado un segundo PDF desde callback');
            } finally {
                genaiModule.GoogleGenAI = originalGoogleGenAI;
            }
        });
    });
});
