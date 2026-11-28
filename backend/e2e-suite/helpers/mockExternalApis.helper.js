'use strict';

const axios = require('axios');

/**
 * Boundary stubs & spies for external HTTP/SDK services:
 * - Google Gemini SDK (@google/genai)
 * - Telegram Bot HTTP API (axios calls to api.telegram.org)
 * - Socket.io real-time room & broadcast emitter capture
 */

function createSocketIoSpy() {
    const events = [];

    const makeEmitter = (room = null) => ({
        emit(event, payload) {
            events.push({ room, event, payload });
        }
    });

    const io = {
        emit(event, payload) {
            events.push({ room: null, event, payload });
        },
        to(room) {
            return makeEmitter(room);
        }
    };

    return {
        io,
        events,
        reset() {
            events.length = 0;
        },
        findByEvent(eventName) {
            return events.filter((e) => e.event === eventName);
        },
        findByRoom(roomName) {
            return events.filter((e) => e.room === roomName);
        }
    };
}

function createTelegramAxiosSpy() {
    const calls = [];
    const origPost = axios.post;
    const origGet = axios.get;
    let messageSeq = 1000;
    let customPostHandler = null;

    const recordCall = async (httpMethod, url, data) => {
        const strUrl = String(url || '');
        const methodMatch = strUrl.match(/\/bot[^/]+\/([a-zA-Z0-9_]+)/);
        const tgMethod = methodMatch ? methodMatch[1] : strUrl;

        const entry = {
            httpMethod,
            tgMethod,
            url: strUrl,
            chatId: null,
            text: null,
            caption: null,
            filename: null,
            mimeType: null,
            fileBuffer: null,
            replyMarkup: null,
            raw: data
        };

        if (data && typeof data === 'object') {
            if (typeof FormData !== 'undefined' && data instanceof FormData) {
                const fdChatId = data.get('chat_id');
                entry.chatId = fdChatId !== null ? String(fdChatId) : (data.chat_id !== undefined ? String(data.chat_id) : null);
                const fdCaption = data.get('caption');
                entry.caption = fdCaption !== null ? String(fdCaption) : (data.caption ?? null);

                const fdMarkup = data.get('reply_markup');
                if (typeof fdMarkup === 'string' && fdMarkup.trim()) {
                    try {
                        entry.replyMarkup = JSON.parse(fdMarkup);
                    } catch (_) {
                        entry.replyMarkup = fdMarkup;
                    }
                } else {
                    entry.replyMarkup = data.reply_markup ?? null;
                }

                const mediaBlob = data.get('photo') || data.get('document') || data.get('audio');
                if (mediaBlob && typeof mediaBlob === 'object') {
                    entry.mimeType = mediaBlob.type || null;
                    entry.filename = mediaBlob.name || data.filename || null;
                    if (typeof mediaBlob.arrayBuffer === 'function') {
                        entry.fileBuffer = Buffer.from(await mediaBlob.arrayBuffer());
                    } else {
                        entry.fileBuffer = data.fileBuffer ?? null;
                    }
                } else {
                    entry.filename = data.filename ?? null;
                    entry.fileBuffer = data.fileBuffer ?? null;
                }
            } else {
                entry.chatId = data.chat_id !== undefined ? String(data.chat_id) : null;
                entry.text = data.text ?? null;
                entry.caption = data.caption ?? null;
                entry.replyMarkup = data.reply_markup ?? null;
            }
        }

        calls.push(entry);
        return entry;
    };

    const install = () => {
        axios.post = async (url, data, config) => {
            const strUrl = String(url || '');
            if (!strUrl.includes('api.telegram.org')) {
                return origPost.call(axios, url, data, config);
            }
            const entry = await recordCall('POST', strUrl, data);
            if (typeof customPostHandler === 'function') {
                const customRes = await customPostHandler(entry);
                if (customRes !== undefined) return customRes;
            }
            const msgId = ++messageSeq;
            return {
                status: 200,
                data: {
                    ok: true,
                    result: {
                        message_id: msgId,
                        chat: { id: Number(entry.chatId) || entry.chatId },
                        text: entry.text || entry.caption || ''
                    }
                }
            };
        };

        axios.get = async (url, config) => {
            const strUrl = String(url || '');
            if (!strUrl.includes('api.telegram.org')) {
                return origGet.call(axios, url, config);
            }
            await recordCall('GET', strUrl, null);
            return {
                status: 200,
                data: {
                    ok: true,
                    result: { id: 999999, is_bot: true, username: 'sipe_e2e_bot', first_name: 'SIPE E2E Bot' }
                }
            };
        };
    };

    const restore = () => {
        axios.post = origPost;
        axios.get = origGet;
    };

    return {
        calls,
        install,
        restore,
        reset() {
            calls.length = 0;
            customPostHandler = null;
        },
        setPostHandler(fn) {
            customPostHandler = fn;
        },
        byMethod(tgMethod) {
            return calls.filter((c) => c.tgMethod === tgMethod);
        }
    };
}

function createGeminiSdkSpy() {
    const calls = [];
    const genaiPath = require.resolve('@google/genai');
    const genaiModule = require(genaiPath);
    const OrigGoogleGenAI = genaiModule.GoogleGenAI;
    const origEnvKey = process.env.GEMINI_API_KEY;
    let handler = null;

    class MockGoogleGenAI {
        constructor({ apiKey }) {
            this.apiKey = apiKey;
            this.models = {
                generateContent: async (payload) => {
                    calls.push({ apiKey, payload });
                    if (typeof handler === 'function') {
                        return handler(payload, calls.length);
                    }
                    const defaultJson = JSON.stringify({
                        tipo_documento: 'Transferencia Bancaria',
                        metodo_pago: 'TRANSFERENCIA',
                        monto_usd: 400.0,
                        fecha: '2026-11-27',
                        banco_origen: 'PROMERICA',
                        cuenta_origen: '2000012345',
                        beneficiario: 'PROVEEDOR DEMO S.A.',
                        referencia: 'TRF-889911',
                        concepto: 'PAGO SERVICIO',
                        confianza: 'alta',
                        observaciones: 'Comprobante legible'
                    });
                    return {
                        text: defaultJson,
                        candidates: [{ content: { parts: [{ text: defaultJson }] } }]
                    };
                }
            };
        }
    }

    const install = () => {
        process.env.GEMINI_API_KEY = 'AIzaSyE2ETestKeyForBoundaryMock123456';
        genaiModule.GoogleGenAI = MockGoogleGenAI;
    };

    const restore = () => {
        genaiModule.GoogleGenAI = OrigGoogleGenAI;
        if (origEnvKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = origEnvKey;
        }
    };

    return {
        calls,
        install,
        restore,
        reset() {
            calls.length = 0;
            handler = null;
        },
        setHandler(fn) {
            handler = fn;
        }
    };
}

module.exports = {
    createSocketIoSpy,
    createTelegramAxiosSpy,
    createGeminiSdkSpy
};
