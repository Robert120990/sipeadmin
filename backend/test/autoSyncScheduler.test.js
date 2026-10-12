const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const {
    AUTO_SYNC_INTERVAL_MINUTES,
    AUTO_SYNC_HOURS,
    AUTO_SYNC_FORMATTED_HOURS,
    AUTO_SYNC_CRON_EXPRESSION,
    AUTO_SYNC_TIMEZONE,
    getAutoSyncStatus,
    initAutoSyncScheduler,
    executeAutoSyncCycle
} = require('../services/autoSyncScheduler');

describe('AutoSync Scheduler Service Tests', () => {
    let originalInstance;

    beforeEach(() => {
        originalInstance = process.env.NODE_APP_INSTANCE;
    });

    afterEach(() => {
        if (originalInstance !== undefined) {
            process.env.NODE_APP_INSTANCE = originalInstance;
        } else {
            delete process.env.NODE_APP_INSTANCE;
        }
    });

    it('debe configurar la sincronización continua cada 30 minutos', () => {
        assert.strictEqual(AUTO_SYNC_INTERVAL_MINUTES, 30);
        assert.strictEqual(AUTO_SYNC_TIMEZONE, 'America/El_Salvador');
        assert.strictEqual(AUTO_SYNC_CRON_EXPRESSION, '*/30 * * * *');
        assert.strictEqual(AUTO_SYNC_HOURS.length, 24);
        assert.strictEqual(AUTO_SYNC_FORMATTED_HOURS.length, 24);
    });

    it('debe utilizar la zona horaria oficial America/El_Salvador y expresión cron válida', () => {
        assert.strictEqual(AUTO_SYNC_TIMEZONE, 'America/El_Salvador');
        assert.strictEqual(AUTO_SYNC_CRON_EXPRESSION, '*/30 * * * *');
    });

    it('debe retornar la estructura correcta en getAutoSyncStatus()', () => {
        const status = getAutoSyncStatus();
        assert.strictEqual(status.enabled, true);
        assert.strictEqual(status.intervalMinutes, 30);
        assert.strictEqual(status.timezone, 'America/El_Salvador');
        assert.strictEqual(status.cronExpression, '*/30 * * * *');
        assert.strictEqual(typeof status.isSyncInProgress, 'boolean');
        assert.ok(status.lastSync !== undefined);
    });

    it('debe prevenir duplicidad en instancias secundarias de clúster PM2 (#1, #2, etc.)', () => {
        process.env.NODE_APP_INSTANCE = '1';
        const task = initAutoSyncScheduler();
        assert.strictEqual(task, null);
    });

    it('debe inicializar la tarea programada en instancia primaria PM2 (#0 o indefinida)', () => {
        process.env.NODE_APP_INSTANCE = '0';
        const task = initAutoSyncScheduler();
        assert.ok(task !== null);
        assert.strictEqual(typeof task.stop, 'function');
        task.stop(); // Detener tarea de prueba
    });

    it('debe ejecutar el ciclo de sincronización unificado correctamente con los runners inyectados', async () => {
        let portalCalled = false;
        let compCalled = false;

        const mockRunners = {
            syncPortal: async () => {
                portalCalled = true;
                return { success: true, count: 15, message: 'Portal OK' };
            },
            syncCompetencia: async () => {
                compCalled = true;
                return { success: true, count: 28, total: 28 };
            }
        };

        const result = await executeAutoSyncCycle(null, 'TEST_MOCK_SUCCESS', mockRunners);
        assert.ok(result);
        assert.strictEqual(result.source, 'TEST_MOCK_SUCCESS');
        assert.strictEqual(portalCalled, true);
        assert.strictEqual(compCalled, true);
        assert.strictEqual(result.pedidos.success, true);
        assert.strictEqual(result.pedidos.count, 15);
        assert.strictEqual(result.preciosCompetencia.success, true);
        assert.strictEqual(result.preciosCompetencia.count, 28);
    });

    it('debe manejar errores de un servicio sin impedir la ejecución del otro', async () => {
        const mockRunners = {
            syncPortal: async () => {
                throw new Error('Fallo simulado en Portal Puma');
            },
            syncCompetencia: async () => {
                return { success: true, count: 24, total: 24 };
            }
        };

        const result = await executeAutoSyncCycle(null, 'TEST_MOCK_PARTIAL_ERROR', mockRunners);
        assert.ok(result);
        assert.strictEqual(result.pedidos.success, false);
        assert.strictEqual(result.pedidos.error, 'Fallo simulado en Portal Puma');
        assert.strictEqual(result.preciosCompetencia.success, true);
        assert.strictEqual(result.preciosCompetencia.count, 24);
    });
});
