const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    sanitizeAudioMimeType,
    sanitizeGeminiApiKey,
    getGeminiApiKey,
    transcribeTelegramVoice
} = require('../services/telegramBotService');

describe('Telegram Voice Note Transcription & Gemini Integration Tests', () => {

    describe('1. MIME Type Sanitization (sanitizeAudioMimeType)', () => {
        it('debe limpiar parámetros de códec en audio/ogg; codecs=opus a audio/ogg', () => {
            const clean = sanitizeAudioMimeType('audio/ogg; codecs=opus');
            assert.equal(clean, 'audio/ogg');
        });

        it('debe normalizar audio/oga y audio/opus a audio/ogg', () => {
            assert.equal(sanitizeAudioMimeType('audio/oga'), 'audio/ogg');
            assert.equal(sanitizeAudioMimeType('audio/opus'), 'audio/ogg');
            assert.equal(sanitizeAudioMimeType('audio/x-opus'), 'audio/ogg');
        });

        it('debe normalizar variantes de mp4, m4a y mp3', () => {
            assert.equal(sanitizeAudioMimeType('audio/mp4'), 'audio/mp4');
            assert.equal(sanitizeAudioMimeType('audio/m4a'), 'audio/mp4');
            assert.equal(sanitizeAudioMimeType('audio/x-m4a'), 'audio/mp4');
            assert.equal(sanitizeAudioMimeType('audio/mpeg'), 'audio/mp3');
            assert.equal(sanitizeAudioMimeType('audio/mp3'), 'audio/mp3');
            assert.equal(sanitizeAudioMimeType('audio/wav'), 'audio/wav');
        });

        it('debe retornar audio/ogg por defecto cuando el MIME sea nulo o vacío', () => {
            assert.equal(sanitizeAudioMimeType(null), 'audio/ogg');
            assert.equal(sanitizeAudioMimeType(''), 'audio/ogg');
            assert.equal(sanitizeAudioMimeType(undefined), 'audio/ogg');
        });
    });

    describe('2. Gemini API Key Resolution & Sanitization (getGeminiApiKey / sanitizeGeminiApiKey)', () => {
        it('debe resolver la clave desde variable de entorno si está presente', async () => {
            const prev = process.env.GEMINI_API_KEY;
            try {
                process.env.GEMINI_API_KEY = 'AIzaSyFakeTestKeyForUnitTests1234567890';
                const key = await getGeminiApiKey();
                assert.equal(key, 'AIzaSyFakeTestKeyForUnitTests1234567890');
            } finally {
                if (prev) {
                    process.env.GEMINI_API_KEY = prev;
                } else {
                    delete process.env.GEMINI_API_KEY;
                }
            }
        });

        it('debe descartar claves placeholder como your_gemini_api_key_here y limpiar comillas o prefijos', async () => {
            assert.equal(sanitizeGeminiApiKey('your_gemini_api_key_here'), null);
            assert.equal(sanitizeGeminiApiKey('YOUR_API_KEY_HERE'), null);
            assert.equal(sanitizeGeminiApiKey('placeholder'), null);
            assert.equal(sanitizeGeminiApiKey('short'), null);
            assert.equal(
                sanitizeGeminiApiKey('GEMINI_API_KEY="AIzaSyRealLookingKey1234567890"'),
                'AIzaSyRealLookingKey1234567890'
            );
            assert.equal(
                sanitizeGeminiApiKey(" 'AIzaSyRealLookingKey1234567890' "),
                'AIzaSyRealLookingKey1234567890'
            );

            const prev = process.env.GEMINI_API_KEY;
            try {
                process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';
                const resolved = await getGeminiApiKey();
                assert.equal(resolved, null);
            } finally {
                if (prev) {
                    process.env.GEMINI_API_KEY = prev;
                } else {
                    delete process.env.GEMINI_API_KEY;
                }
            }
        });
    });

    describe('3. Validation & Resilience in transcribeTelegramVoice', () => {
        it('debe rechazar buffers nulos o vacíos', async () => {
            await assert.rejects(
                async () => transcribeTelegramVoice(null),
                /Buffer de audio inválido o vacío/
            );
            await assert.rejects(
                async () => transcribeTelegramVoice(Buffer.from([])),
                /Buffer de audio inválido o vacío/
            );
        });

        it('debe fallar informativamente si GEMINI_API_KEY no está configurada', async () => {
            const prev = process.env.GEMINI_API_KEY;
            try {
                delete process.env.GEMINI_API_KEY;
                const dummyBuffer = Buffer.from('RIFF....WAVEfmt ');
                await assert.rejects(
                    async () => transcribeTelegramVoice(dummyBuffer, 'audio/ogg'),
                    /GEMINI_API_KEY no configurado/
                );
            } finally {
                if (prev) process.env.GEMINI_API_KEY = prev;
            }
        });
    });
});
