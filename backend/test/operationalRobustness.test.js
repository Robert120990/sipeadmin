const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const { JWT_SECRET } = require('../middleware/auth');
const {
    signUploadUrl,
    verifySignedUploadUrl,
    requireSignedOrAuthenticatedUpload
} = require('../utils/uploadSigner');
const {
    readSavedReceiptAsBuffer,
    deleteReceiptFile
} = require('../services/recordatoriosPagosService');
const { getDateStr } = require('../services/telegramTextAndDates');
const {
    pendingFeedbackUsers,
    userConversationContext,
    pendingAlertJustifications,
    pruneBotMemoryMaps
} = require('../services/telegramBotService');
const {
    pendingTaskWizards,
    pendingEventWizards
} = require('../services/telegramProductivityService');
const { closeExternalPools, closeAllPools } = require('../db');
const { stopMibotScheduler } = require('../services/mibotNotifierService');
const { stopTicketRealtimeWatcher } = require('../services/ticketService');

function makeMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

describe('Operational Robustness & Bloque 1/2 Contracts', () => {
    afterEach(() => {
        pendingFeedbackUsers.clear();
        userConversationContext.clear();
        pendingAlertJustifications.clear();
        pendingTaskWizards.clear();
        pendingEventWizards.clear();
    });

    it('uploadSigner genera y verifica firmas HMAC-SHA256 con expiración y rechaza manipulación', () => {
        const cleanUrl = '/api/uploads/pagos/pago_101_1700000000_abcdef.webp';
        const signed = signUploadUrl(cleanUrl, 3600);
        const parsed = new URL(`https://example.local${signed}`);
        const exp = parsed.searchParams.get('exp');
        const sig = parsed.searchParams.get('sig');

        assert.strictEqual(parsed.pathname, cleanUrl);
        assert.ok(exp && sig);
        assert.strictEqual(verifySignedUploadUrl(cleanUrl, exp, sig), true);

        // Manipulación de ruta o firma o path traversal debe fallar
        assert.strictEqual(verifySignedUploadUrl('/api/uploads/pagos/otro.webp', exp, sig), false);
        assert.strictEqual(verifySignedUploadUrl('/api/uploads/pagos/../secret.env', exp, sig), false);
        assert.strictEqual(verifySignedUploadUrl(cleanUrl, exp, '0'.repeat(sig.length)), false);
        assert.strictEqual(verifySignedUploadUrl(cleanUrl, String(Math.floor(Date.now() / 1000) - 10), sig), false);

        // URLs fuera de /api/uploads/ no se firman
        assert.strictEqual(signUploadUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
    });

    it('requireSignedOrAuthenticatedUpload acepta firma válida o JWT Bearer y rechaza acceso anónimo con 401', async () => {
        const cleanUrl = '/api/uploads/pagos/pago_202_demo.webp';
        const signed = signUploadUrl(cleanUrl, 600);
        const parsed = new URL(`https://example.local${signed}`);

        // 1. Sin firma ni token -> 401
        const resAnon = makeMockRes();
        let nextCalledAnon = false;
        requireSignedOrAuthenticatedUpload(
            { baseUrl: '/api/uploads/pagos', path: '/pago_202_demo.webp', query: {}, headers: {} },
            resAnon,
            () => { nextCalledAnon = true; }
        );
        assert.strictEqual(nextCalledAnon, false);
        assert.strictEqual(resAnon.statusCode, 401);

        // 2. Firma válida sin Bearer -> next()
        const resSigned = makeMockRes();
        let nextCalledSigned = false;
        requireSignedOrAuthenticatedUpload(
            {
                baseUrl: '/api/uploads/pagos',
                path: '/pago_202_demo.webp',
                query: { exp: parsed.searchParams.get('exp'), sig: parsed.searchParams.get('sig') },
                headers: {}
            },
            resSigned,
            () => { nextCalledSigned = true; }
        );
        assert.strictEqual(nextCalledSigned, true);

        // 3. Bearer JWT válido sin query firmado -> next()
        const bearer = jwt.sign({ id: 999999, username: 'tester', status: 'active', tv: 1 }, JWT_SECRET, { expiresIn: '5m' });
        const resJwt = makeMockRes();
        let nextCalledJwt = false;
        await new Promise((resolve) => {
            requireSignedOrAuthenticatedUpload(
                {
                    baseUrl: '/api/uploads/pagos',
                    path: '/pago_202_demo.webp',
                    query: {},
                    headers: { authorization: `Bearer ${bearer}` }
                },
                resJwt,
                () => {
                    nextCalledJwt = true;
                    resolve();
                }
            );
            setImmediate(resolve);
        });
        assert.strictEqual(nextCalledJwt, true);
    });

    it('recordatoriosPagosService limpia query params firmados antes de validar archivos en disco', () => {
        assert.throws(
            () => readSavedReceiptAsBuffer('/api/uploads/pagos/archivo_inexistente_test.webp?exp=9999999999&sig=abc123'),
            /no encontrado en el servidor/
        );
        assert.doesNotThrow(
            () => deleteReceiptFile('/api/uploads/pagos/archivo_inexistente_test.webp?exp=9999999999&sig=abc123')
        );
    });

    it('getDateStr utiliza calendario de America/El_Salvador con desplazamientos consistentes', () => {
        const svFmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/El_Salvador',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const expectedToday = svFmt.format(new Date());
        const today = getDateStr(0);
        const yesterday = getDateStr(-1);
        const tomorrow = getDateStr(1);

        assert.strictEqual(today, expectedToday);
        assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

        const msPerDay = 24 * 60 * 60 * 1000;
        const todayMs = Date.parse(`${today}T00:00:00Z`);
        const yesterdayMs = Date.parse(`${yesterday}T00:00:00Z`);
        const tomorrowMs = Date.parse(`${tomorrow}T00:00:00Z`);
        assert.strictEqual(todayMs - yesterdayMs, msPerDay);
        assert.strictEqual(tomorrowMs - todayMs, msPerDay);
    });

    it('pruneBotMemoryMaps depura entradas expiradas y acota mapas al máximo configurado', () => {
        const now = Date.now();
        const expiredTs = now - 60 * 60 * 1000;

        userConversationContext.set('expired_u', { updatedAt: expiredTs, history: [] });
        userConversationContext.set('fresh_u1', { updatedAt: now, history: [] });
        userConversationContext.set('fresh_u2', { updatedAt: now, history: [] });
        userConversationContext.set('fresh_u3', { updatedAt: now, history: [] });

        pendingFeedbackUsers.set('expired_fb', { feedbackId: 1, timestamp: expiredTs });
        pendingAlertJustifications.set('expired_al', { date: '2026-01-01', timestamp: expiredTs });
        pendingTaskWizards.set('expired_tw', { step: 'ask', updatedAt: expiredTs });
        pendingEventWizards.set('expired_ew', { step: 'ask', timestamp: expiredTs });
        pendingTaskWizards.set('fresh_tw', { step: 'ask', updatedAt: now });

        const stats = pruneBotMemoryMaps(2);
        assert.ok(stats.totalRemoved >= 6);
        assert.strictEqual(userConversationContext.has('expired_u'), false);
        assert.strictEqual(userConversationContext.size, 2);
        assert.strictEqual(pendingFeedbackUsers.size, 0);
        assert.strictEqual(pendingAlertJustifications.size, 0);
        assert.strictEqual(pendingEventWizards.size, 0);
        assert.strictEqual(pendingTaskWizards.has('fresh_tw'), true);
    });

    it('helpers de cierre elegante (pools y schedulers) son invocables sin error', async () => {
        await closeExternalPools('main');
        await closeExternalPools('accounting');
        if (process.env.RUN_POOL_CLOSE_TEST === '1') {
            await closeAllPools();
        }
        assert.strictEqual(typeof closeAllPools, 'function');
        assert.doesNotThrow(() => stopMibotScheduler());
        assert.doesNotThrow(() => stopTicketRealtimeWatcher());
    });

    it('ecosystem.config.cjs y deploy.sh cumplen estándares de seguridad y healthcheck', () => {
        const ecoPath = path.resolve(__dirname, '..', '..', 'ecosystem.config.cjs');
        const deployPath = path.resolve(__dirname, '..', '..', 'deploy.sh');
        const ecoContent = fs.readFileSync(ecoPath, 'utf8');
        const deployContent = fs.readFileSync(deployPath, 'utf8');

        assert.strictEqual(ecoContent.includes('sipe_orchestrator_2026_secure_token'), false);
        assert.ok(deployContent.includes('/api/health'), 'deploy.sh debe validar /api/health');
        assert.ok(deployContent.includes('Abortando despliegue'), 'deploy.sh debe abortar si falla build/install');
    });
});
