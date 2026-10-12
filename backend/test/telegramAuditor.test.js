const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
    MAX_ERROR_BUFFER_SIZE,
    recordError,
    getErrors,
    clearErrors,
    recordUserActivity,
    getActiveUsersCount,
    recordQueryReceived,
    recordQuerySuccess,
    recordQueryFailure,
    recordVoiceNoteProcessed,
    recordVoiceNoteFailed,
    recordMultiTurnQuery,
    recordAlertCallback,
    getMetrics,
    resetMetrics,
    getHealthDiagnostics,
    formatDiagnosticsMessage
} = require('../services/telegramAuditorService');

describe('Telegram Auditor Service Unit Tests', () => {

    beforeEach(() => {
        clearErrors();
        resetMetrics();
    });

    describe('Buffer circular de errores forenses', () => {
        it('debe registrar eventos de error con estructura forense completa', () => {
            const err = recordError({
                type: 'AI_ERROR',
                message: 'Timeout conectando con Gemini API',
                stack: 'Error: Timeout\n    at askConversationalAgent (line 350)',
                userId: '778899',
                chatId: '-100987654321',
                query: '¿Cuánto vendió Miraflores ayer?',
                details: { attempt: 3, latencyMs: 5020 }
            });

            assert.ok(err.id.startsWith('err_'));
            assert.strictEqual(err.type, 'AI_ERROR');
            assert.strictEqual(err.severity, 'error');
            assert.strictEqual(err.message, 'Timeout conectando con Gemini API');
            assert.ok(err.stack.includes('askConversationalAgent'));
            assert.strictEqual(err.userId, '778899');
            assert.strictEqual(err.chatId, '-100987654321');
            assert.strictEqual(err.query, '¿Cuánto vendió Miraflores ayer?');
            assert.deepStrictEqual(err.details, { attempt: 3, latencyMs: 5020 });
            assert.ok(Date.parse(err.timestamp) > 0);

            const errors = getErrors();
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].id, err.id);
        });

        it('debe mantener exactamente MAX_ERROR_BUFFER_SIZE elementos sin desbordamiento (descarte FIFO)', () => {
            assert.strictEqual(MAX_ERROR_BUFFER_SIZE, 50);

            // Insertar 65 errores secuenciales
            for (let i = 1; i <= 65; i++) {
                recordError({
                    type: 'QUERY_ERROR',
                    message: `Fallo secuencial #${i}`,
                    details: { index: i }
                });
            }

            const buffer = getErrors();
            // Debe estar topado en 50
            assert.strictEqual(buffer.length, 50);

            // El más reciente (#65) debe estar al inicio (index 0)
            assert.strictEqual(buffer[0].message, 'Fallo secuencial #65');
            assert.strictEqual(buffer[0].details.index, 65);

            // El más antiguo en el buffer debe ser el #16 (65 - 50 + 1 = 16)
            assert.strictEqual(buffer[49].message, 'Fallo secuencial #16');
            assert.strictEqual(buffer[49].details.index, 16);
        });

        it('debe filtrar errores por tipo y respetar el parámetro limit', () => {
            recordError({ type: 'POLLING_ERROR', message: '409 Conflict' });
            recordError({ type: 'AI_ERROR', message: 'Quota exceeded' });
            recordError({ type: 'POLLING_ERROR', message: 'Connection reset' });
            recordError({ type: 'QUERY_ERROR', message: 'Syntax error' });

            const pollingErrors = getErrors({ type: 'POLLING_ERROR' });
            assert.strictEqual(pollingErrors.length, 2);
            assert.ok(pollingErrors.every(e => e.type === 'POLLING_ERROR'));

            const limited = getErrors({ limit: 2 });
            assert.strictEqual(limited.length, 2);
        });

        it('debe limpiar el buffer completamente con clearErrors', () => {
            recordError({ type: 'TEST_ERROR', message: 'Prueba de limpieza' });
            recordError({ type: 'TEST_ERROR', message: 'Prueba de limpieza 2' });

            assert.strictEqual(getErrors().length, 2);

            const result = clearErrors();
            assert.strictEqual(result.cleared, 2);
            assert.strictEqual(result.remaining, 0);
            assert.strictEqual(getErrors().length, 0);
        });

        it('debe inferir severidades críticas para errores de base de datos o polling', () => {
            const errDb = recordError({ type: 'DB_ERROR', message: 'Conexión rechazada' });
            assert.strictEqual(errDb.severity, 'critical');

            const errPoll = recordError({ type: 'POLLING_ERROR', message: 'Sondeo interrumpido' });
            assert.strictEqual(errPoll.severity, 'critical');

            const errWarn = recordError({ type: 'AUTH_WARN', message: 'Usuario no registrado' });
            assert.strictEqual(errWarn.severity, 'warning');
        });
    });

    describe('Cálculo de tasas de error y métricas acumuladas', () => {
        it('debe calcular métricas iniciales en cero', () => {
            const m = getMetrics();
            assert.strictEqual(m.totalQueriesReceived, 0);
            assert.strictEqual(m.totalSuccessfulQueries, 0);
            assert.strictEqual(m.totalFailedQueries, 0);
            assert.strictEqual(m.errorRatePct, 0);
            assert.strictEqual(m.averageResponseTimeMs, 0);
            assert.strictEqual(m.voiceNotesProcessed, 0);
            assert.strictEqual(m.voiceNotesFailed, 0);
            assert.strictEqual(m.multiTurnQueriesCount, 0);
            assert.strictEqual(m.alertCallbacksHandled, 0);
        });

        it('debe calcular la tasa de error global y tiempo promedio de respuesta correctamente', () => {
            recordQueryReceived('user1');
            recordQuerySuccess({ durationMs: 100, userIdOrChatId: 'user1' });

            recordQueryReceived('user2');
            recordQuerySuccess({ durationMs: 200, userIdOrChatId: 'user2' });

            recordQueryReceived('user3');
            recordQuerySuccess({ durationMs: 150, userIdOrChatId: 'user3' });

            recordQueryReceived('user4');
            recordQueryFailure({
                durationMs: 350,
                type: 'QUERY_ERROR',
                message: 'Error de prueba',
                userId: 'user4',
                chatId: 'chat4'
            });

            const m = getMetrics();
            assert.strictEqual(m.totalQueriesReceived, 4);
            assert.strictEqual(m.totalSuccessfulQueries, 3);
            assert.strictEqual(m.totalFailedQueries, 1);

            // Tasa de error = (1 / 4) * 100 = 25.00%
            assert.strictEqual(m.errorRatePct, 25);

            // Latencia promedio = (100 + 200 + 150 + 350) / 4 = 800 / 4 = 200 ms
            assert.strictEqual(m.averageResponseTimeMs, 200);

            // Debe haberse registrado el error en el buffer
            const errors = getErrors();
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].userId, 'user4');
        });

        it('debe registrar notas de voz procesadas y fallidas', () => {
            recordVoiceNoteProcessed('user_voice_1');
            recordVoiceNoteProcessed('user_voice_2');
            recordVoiceNoteFailed({
                error: new Error('Audio no soportado'),
                userId: 'user_voice_3',
                chatId: 'chat_voice_3'
            });

            const m = getMetrics();
            assert.strictEqual(m.voiceNotesProcessed, 2);
            assert.strictEqual(m.voiceNotesFailed, 1);

            const errs = getErrors({ type: 'VOICE_ERROR' });
            assert.strictEqual(errs.length, 1);
            assert.ok(errs[0].message.includes('Audio no soportado'));
        });

        it('debe registrar consultas multi-turno y callbacks de alertas', () => {
            recordMultiTurnQuery('chat_101');
            recordMultiTurnQuery('chat_101');
            recordAlertCallback('user_admin');

            const m = getMetrics();
            assert.strictEqual(m.multiTurnQueriesCount, 2);
            assert.strictEqual(m.alertCallbacksHandled, 1);
        });

        it('debe calcular usuarios activos en los últimos 20 minutos', () => {
            assert.strictEqual(getActiveUsersCount(20), 0);

            recordUserActivity('user_active_1');
            recordUserActivity('user_active_2');
            recordUserActivity('user_active_1'); // Repetido debe seguir contando como 1

            assert.strictEqual(getActiveUsersCount(20), 2);
        });

        it('debe resetear todas las métricas y sesiones con resetMetrics', () => {
            recordQueryReceived('user_a');
            recordQuerySuccess({ durationMs: 120 });
            recordVoiceNoteProcessed('user_b');
            recordMultiTurnQuery('chat_c');
            recordAlertCallback('user_d');

            assert.strictEqual(getMetrics().totalQueriesReceived, 1);
            assert.strictEqual(getActiveUsersCount(20), 4);

            const reset = resetMetrics();
            assert.strictEqual(reset.totalQueriesReceived, 0);
            assert.strictEqual(reset.totalSuccessfulQueries, 0);
            assert.strictEqual(reset.voiceNotesProcessed, 0);
            assert.strictEqual(reset.multiTurnQueriesCount, 0);
            assert.strictEqual(reset.alertCallbacksHandled, 0);
            assert.strictEqual(getActiveUsersCount(20), 0);
        });
    });

    describe('Diagnóstico consolidado de salud (getHealthDiagnostics)', () => {
        it('debe devolver la estructura completa de salud operacional de forma resiliente', async () => {
            recordQueryReceived('u1');
            recordQuerySuccess({ durationMs: 95 });
            recordError({ type: 'TEST_DIAG', message: 'Error para diagnóstico' });

            const diag = await getHealthDiagnostics();

            assert.ok(diag.status === 'healthy' || diag.status === 'degraded' || diag.status === 'critical');
            assert.ok(Date.parse(diag.timestamp) > 0);

            // Bot
            assert.ok('isPolling' in diag.bot);
            assert.ok('isActive' in diag.bot);
            assert.ok('isConnected' in diag.bot);

            // Bases de datos
            assert.ok(diag.databases.sipeAdmin);
            assert.strictEqual(diag.databases.sipeAdmin.name, process.env.DB_NAME || 'db_sipe_admin');
            assert.ok('connected' in diag.databases.sipeAdmin);
            assert.ok('latencyMs' in diag.databases.sipeAdmin);

            assert.ok(diag.databases.sistemaSaas);
            assert.strictEqual(diag.databases.sistemaSaas.name, process.env.EXTERNAL_DB_NAME || 'db_sistema_saas');
            assert.ok('connected' in diag.databases.sistemaSaas);
            assert.ok('latencyMs' in diag.databases.sistemaSaas);

            // Gemini API
            assert.ok(diag.gemini);
            assert.strictEqual(diag.gemini.configured, !!process.env.GEMINI_API_KEY);
            assert.strictEqual(diag.gemini.model, 'gemini-2.0-flash');

            // Sesiones y memoria
            assert.ok(diag.activeConversations);
            assert.strictEqual(diag.activeConversations.windowMinutes, 20);
            assert.ok(typeof diag.activeConversations.count === 'number');

            // Feedback
            assert.ok(diag.feedbackSatisfaction);
            assert.ok('satisfactionRatePct' in diag.feedbackSatisfaction);
            assert.ok('pendingImprovementComments' in diag.feedbackSatisfaction);

            // Métricas
            assert.ok(diag.metrics);
            assert.strictEqual(diag.metrics.totalQueriesReceived, 1);
            assert.strictEqual(diag.metrics.totalSuccessfulQueries, 1);

            // Errores recientes
            assert.ok(Array.isArray(diag.recentErrors));
            assert.ok(diag.recentErrors.length <= 10);
            assert.strictEqual(diag.recentErrors[0].message, 'Error para diagnóstico');
        });
    });

    describe('Generación de reporte HTML para Telegram (formatDiagnosticsMessage)', () => {
        it('debe estructurar un reporte HTML ejecutivo para administradores con todas las secciones clave', async () => {
            const mockDiagnostics = {
                status: 'healthy',
                timestamp: '2026-10-12T19:30:00.000Z',
                bot: {
                    isPolling: true,
                    isActive: true,
                    lastPollAt: '2026-10-12T19:29:55.000Z',
                    isConnected: true,
                    username: '@SIPE_IA_BOT'
                },
                databases: {
                    sipeAdmin: {
                        name: 'db_sipe_admin',
                        connected: true,
                        latencyMs: 4,
                        error: null
                    },
                    sistemaSaas: {
                        name: 'db_sistema_saas',
                        connected: true,
                        latencyMs: 7,
                        error: null
                    }
                },
                gemini: {
                    configured: true,
                    model: 'gemini-2.0-flash'
                },
                activeConversations: {
                    count: 3,
                    windowMinutes: 20
                },
                feedbackSatisfaction: {
                    total: 25,
                    utiles: 23,
                    no_utiles: 2,
                    satisfactionRatePct: 92.0,
                    pendingImprovementComments: 1
                },
                metrics: {
                    totalQueriesReceived: 80,
                    totalSuccessfulQueries: 78,
                    totalFailedQueries: 2,
                    errorRatePct: 2.5,
                    averageResponseTimeMs: 145,
                    voiceNotesProcessed: 4,
                    voiceNotesFailed: 0,
                    multiTurnQueriesCount: 15,
                    alertCallbacksHandled: 8
                },
                recentErrors: [
                    {
                        type: 'QUERY_ERROR',
                        message: 'Error sintaxis en fecha de consulta',
                        timestamp: '2026-10-12T18:45:00.000Z'
                    }
                ]
            };

            const html = await formatDiagnosticsMessage(mockDiagnostics);

            // Verificaciones de contenido y etiquetas HTML
            assert.ok(html.includes('DIAGNÓSTICO DE SALUD Y AUDITORÍA SIPE'));
            assert.ok(html.includes('SISTEMA SALUDABLE Y OPERATIVO'));
            assert.ok(html.includes('@SIPE_IA_BOT'));
            assert.ok(html.includes('db_sipe_admin:</b> 🟢 Conectada (4 ms)'));
            assert.ok(html.includes('db_sistema_saas:</b> 🟢 Conectada (7 ms)'));
            assert.ok(html.includes('Gemini 2.0 Flash: 🟢 Configurado'));
            assert.ok(html.includes('Sesiones Activas (últimos 20 min): 👥 <b>3</b>'));
            assert.ok(html.includes('Consultas Recibidas: <b>80</b>'));
            assert.ok(html.includes('Exitosas: 🟢 <b>78</b>'));
            assert.ok(html.includes('Fallidas: 🔴 <b>2</b>'));
            assert.ok(html.includes('Tasa Global de Error: <b>2.5%</b>'));
            assert.ok(html.includes('Latencia Promedio: ⏱️ <b>145 ms</b>'));
            assert.ok(html.includes('Tasa Útil: <b>92%</b>'));
            assert.ok(html.includes('Sugerencias Pendientes de Revisión: 📝 <b>1</b>'));
            assert.ok(html.includes('Error sintaxis en fecha de consulta'));

            // Debe usar tags HTML válidos para Telegram
            assert.ok(!html.includes('<script>'));
            assert.ok(html.includes('<b>') && html.includes('</b>'));
            assert.ok(html.includes('<i>') && html.includes('</i>'));
            assert.ok(html.includes('<code>') && html.includes('</code>'));
        });

        it('debe reflejar estado degradado y escapar caracteres conflictivos en errores', async () => {
            const degradedDiagnostics = {
                status: 'degraded',
                bot: { isPolling: false, isActive: true },
                databases: {
                    sipeAdmin: { connected: true, latencyMs: 5 },
                    sistemaSaas: { connected: false, error: 'Connection refused <127.0.0.1:3306> & timeout' }
                },
                gemini: { configured: false },
                activeConversations: { count: 0 },
                metrics: { totalQueriesReceived: 10, totalFailedQueries: 3, errorRatePct: 30, averageResponseTimeMs: 400 },
                feedbackSatisfaction: { satisfactionRatePct: 70, pendingImprovementComments: 4 },
                recentErrors: [
                    {
                        type: 'DB_ERROR',
                        message: 'Error al conectar <tag> & "comillas"',
                        timestamp: '2026-10-12T19:00:00.000Z'
                    }
                ]
            };

            const html = await formatDiagnosticsMessage(degradedDiagnostics);

            assert.ok(html.includes('ESTADO DEGRADADO'));
            assert.ok(html.includes('&lt;127.0.0.1:3306&gt; &amp; timeout'));
            assert.ok(html.includes('&lt;tag&gt; &amp;'));
            assert.ok(html.includes('Tasa Global de Error: <b>30%</b>'));
        });
    });

    describe('Seguridad y Enmascaramiento de Token de Telegram', () => {
        const telegramRouter = require('../routes/telegram');
        const maskToken = telegramRouter.maskToken;

        it('debe enmascarar tokens preservando prefijo y sufijo para verificación segura', () => {
            const token = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
            const masked = maskToken(token);
            assert.strictEqual(masked.startsWith('12345678'), true);
            assert.strictEqual(masked.endsWith('wxYZ'), true);
            assert.ok(masked.includes('••••••••'));
            assert.ok(!masked.includes('ABCdefGHI'));
        });

        it('debe manejar tokens cortos o vacíos de forma segura sin exponer caracteres', () => {
            assert.strictEqual(maskToken(''), '');
            assert.strictEqual(maskToken(null), '');
            assert.strictEqual(maskToken(undefined), '');
            assert.strictEqual(maskToken('short_token'), '••••••••');
        });

        it('no debe existir ningún token de bot en código fuente o base de datos por defecto', () => {
            const leakedToken = '8852249993:AAHs51t4kIGqXfdEl8epRL0Le08PTZ52qu0';
            const fs = require('fs');
            const path = require('path');
            const botServiceContent = fs.readFileSync(path.join(__dirname, '../services/telegramBotService.js'), 'utf8');
            const dbContent = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');
            const envExampleContent = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');

            assert.strictEqual(botServiceContent.includes(leakedToken), false);
            assert.strictEqual(dbContent.includes(leakedToken), false);
            assert.strictEqual(envExampleContent.includes(leakedToken), false);
        });
    });
});
