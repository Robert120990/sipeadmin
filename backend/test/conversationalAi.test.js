const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    appendToHistory,
    getFormattedHistory,
    clearConversation,
    normalizeStr,
    buildLiveProjectContext
} = require('../services/conversationalAiService');

describe('Conversational AI Service Unit Tests', () => {

    describe('normalizeStr', () => {
        it('debe normalizar cadenas eliminando tildes y caracteres especiales', () => {
            assert.strictEqual(normalizeStr('¿Cuánto diésel vendió Costa del Sol?'), 'cuanto diesel vendio costa del sol');
            assert.strictEqual(normalizeStr('  ¡Hola, SIPE Admin!  '), 'hola sipe admin');
        });
    });

    describe('Memoria Conversacional (Sliding Window)', () => {
        const testChatId = 'test_chat_999';

        it('debe almacenar y recuperar turnos en el orden cronológico', () => {
            clearConversation(testChatId);
            appendToHistory(testChatId, 'user', '¿Cuánto diesel vendió Costa del Sol?');
            appendToHistory(testChatId, 'model', 'Costa del Sol vendió 3,420 galones de diesel.');

            const history = getFormattedHistory(testChatId);
            assert.strictEqual(history.length, 2);
            assert.strictEqual(history[0].role, 'user');
            assert.strictEqual(history[0].parts[0].text, '¿Cuánto diesel vendió Costa del Sol?');
            assert.strictEqual(history[1].role, 'model');
            assert.strictEqual(history[1].parts[0].text, 'Costa del Sol vendió 3,420 galones de diesel.');
        });

        it('debe respetar el límite de 8 mensajes (deslizando los más antiguos)', () => {
            clearConversation(testChatId);
            for (let i = 1; i <= 10; i++) {
                appendToHistory(testChatId, i % 2 === 1 ? 'user' : 'model', `Mensaje ${i}`);
            }

            const history = getFormattedHistory(testChatId);
            assert.strictEqual(history.length, 8);
            // El primer mensaje debe ser Mensaje 3 (los 1 y 2 fueron descartados)
            assert.strictEqual(history[0].parts[0].text, 'Mensaje 3');
            assert.strictEqual(history[7].parts[0].text, 'Mensaje 10');
        });

        it('clearConversation debe vaciar el historial del chat', () => {
            clearConversation(testChatId);
            const history = getFormattedHistory(testChatId);
            assert.strictEqual(history.length, 0);
        });
    });

    describe('buildLiveProjectContext', () => {
        it('debe compilar el catálogo de estaciones de SIPE Admin y la estructura de datos', async () => {
            const context = await buildLiveProjectContext('2026-10-11');
            assert.ok(context);
            assert.strictEqual(context.fecha_consulta, '2026-10-11');
            assert.ok(Array.isArray(context.estaciones_catalogo));
            assert.ok(context.estaciones_catalogo.length >= 5);
            assert.ok(context.estaciones_catalogo.some(e => e.id === '008' && e.nombre.includes('Costa del Sol')));
            assert.ok(context.estaciones_catalogo.some(e => e.id === '002' && e.nombre.includes('Miraflores')));
            assert.ok(context.estaciones_catalogo.some(e => e.id === '006' && e.nombre.includes('Chalchuapa')));
        });
    });
});
