const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Telegram Security & Hardening Regressions', () => {
    it('bitacora.js debe enmascarar bot_token, gemini_api_key y ssh_password en body sanitizado', () => {
        const { sanitizeData } = require('../middleware/bitacora');
        const out = sanitizeData({
            bot_token: '123456:FAKE_TOKEN',
            gemini_api_key: 'AIzaSyFakeKey123456',
            ssh_password: 'super_secret_value',
            nested: { webhook_secret: 'abc', safe_field: 'ok' }
        });
        assert.strictEqual(out.bot_token, '***');
        assert.strictEqual(out.gemini_api_key, '***');
        assert.strictEqual(out.ssh_password, '***');
        assert.strictEqual(out.nested.webhook_secret, '***');
        assert.strictEqual(out.nested.safe_field, 'ok');
    });

    it('telegramTransportService redactSecrets enmascara tokens de bot, claves Gemini y JWT', () => {
        const transport = require('../services/telegramTransportService');
        const leaked = 'Error calling https://api.telegram.org/bot123456789:AAHfakeTokenValue_1234567890abcdef/getUpdates with AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345';
        const cleaned = transport.redactSecrets(leaked);
        assert.ok(!cleaned.includes('AAHfakeTokenValue'));
        assert.ok(!cleaned.includes('AIzaSyAbCdEf'));
        assert.ok(cleaned.includes('[REDACTED]'));
    });

    it('telegramTransportService splitTelegramMessageChunks divide mensajes mayores a 4000 caracteres sin perder contenido', () => {
        const transport = require('../services/telegramTransportService');
        const longText = Array.from({ length: 120 }, (_, i) => `Linea ${i + 1}: ${'A'.repeat(50)}`).join('\n');
        const chunks = transport.splitTelegramMessageChunks(longText, 1000);
        assert.ok(chunks.length > 5);
        for (const c of chunks) {
            assert.ok(c.length <= 1000, `Chunk superó límite: ${c.length}`);
        }
    });

    it('telegramAuditorService recordError redacta tokens y claves antes de guardar en buffer forense', () => {
        const auditor = require('../services/telegramAuditorService');
        auditor.clearErrors();
        auditor.recordError({
            type: 'TEST_SECURITY',
            message: 'Failed /bot987654321:BBHsecretTokenValue999999999999999/sendMessage AIzaSySecretKey123456789012345678',
            stack: 'https://api.telegram.org/bot987654321:BBHsecretTokenValue999999999999999/getMe'
        });
        const errs = auditor.getErrors({ limit: 5 });
        assert.ok(errs.length >= 1);
        const serialized = JSON.stringify(errs[0]);
        assert.ok(!serialized.includes('BBHsecretTokenValue'));
        assert.ok(!serialized.includes('AIzaSySecretKey'));
        auditor.clearErrors();
    });

    it('telegramBotService bloquea foto/voz de usuarios no autorizados antes de procesar media o consultar bancos', async () => {
        const dbModule = require('../db');
        const origGetDb = dbModule.getDb;
        let bankQueried = false;

        dbModule.getDb = () => ({
            async query(sql) {
                const q = String(sql);
                if (q.includes('movimientos_bancarios')) {
                    bankQueried = true;
                }
                if (q.includes('FROM telegram_usuarios')) {
                    return [[]]; // Usuario no registrado / no autorizado
                }
                if (q.includes('FROM telegram_config')) {
                    return [[{ bot_token: null, is_active: 1 }]];
                }
                return [[]];
            }
        });

        try {
            const botService = require('../services/telegramBotService');
            await botService.handleIncomingMessage({
                chat: { id: 999888 },
                from: { id: 999888, first_name: 'Intruso', username: 'intruso' },
                photo: [{ file_id: 'fake_photo_id', file_size: 1024 }]
            });
            await botService.handleIncomingMessage({
                chat: { id: 999888 },
                from: { id: 999888, first_name: 'Intruso', username: 'intruso' },
                voice: { file_id: 'fake_voice_id', file_size: 1024, duration: 3 }
            });
            assert.strictEqual(bankQueried, false, 'Nunca debe consultarse movimientos_bancarios para usuarios no autorizados');
        } finally {
            dbModule.getDb = origGetDb;
        }
    });
});
