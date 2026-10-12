const cron = require('node-cron');
const energyLatamService = require('./energyLatamService');
const syncDGEHM = require('../sync-dgehm-direct');

/**
 * Horarios de sincronización automática (4 veces al día):
 * - 08:00 AM (08:00)
 * - 11:00 AM (11:00)
 * - 02:00 PM (14:00)
 * - 04:00 PM (16:00)
 *
 * Zona horaria oficial: America/El_Salvador (UTC-6)
 * Expresión Cron: '0 8,11,14,16 * * *'
 */
const AUTO_SYNC_HOURS = [8, 11, 14, 16];
const AUTO_SYNC_FORMATTED_HOURS = ['08:00 AM', '11:00 AM', '02:00 PM', '04:00 PM'];
const AUTO_SYNC_CRON_EXPRESSION = '0 8,11,14,16 * * *';
const AUTO_SYNC_TIMEZONE = 'America/El_Salvador';

let isSyncInProgress = false;
let globalIo = null;
let lastSyncMetadata = {
    lastRunAt: null,
    lastScheduledSlot: null,
    pedidos: null,
    preciosCompetencia: null,
    durationMs: 0,
    source: null
};

/**
 * Ejecuta el ciclo unificado de sincronización automática de:
 * 1. Pedidos y cuentas del portal Puma Energy-Latam (límite 50 órdenes)
 * 2. Precios oficiales de estaciones de la competencia desde DGEHM
 *
 * @param {object|null} io - Instancia de Socket.io para emisión de eventos en tiempo real
 * @param {string} source - Identificador del origen ('CRON_08:00 AM', 'MANUAL', etc.)
 * @param {object} syncRunners - Inyección opcional de ejecutores ({ syncPortal, syncCompetencia })
 * @returns {Promise<object>} Resumen de resultados de ambas sincronizaciones
 */
async function executeAutoSyncCycle(io = null, source = 'CRON', syncRunners = {}) {
    const activeIo = io || globalIo;

    if (isSyncInProgress) {
        console.warn(`[AutoSync Scheduler] Sincronización en curso omitida (${source}) para evitar traslape.`);
        return {
            success: false,
            message: 'Ya hay una sincronización en curso',
            isSyncInProgress: true
        };
    }

    isSyncInProgress = true;
    const startTime = Date.now();
    const runTimestamp = new Date().toISOString();
    const horaElSalvador = new Date().toLocaleTimeString('es-SV', {
        timeZone: AUTO_SYNC_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    console.log(`[AutoSync Scheduler] 🚀 INICIANDO SINCRONIZACIÓN AUTOMÁTICA [${source}] a las ${horaElSalvador}...`);

    const result = {
        timestamp: runTimestamp,
        horaElSalvador,
        source,
        pedidos: null,
        preciosCompetencia: null,
        durationMs: 0
    };

    // 1. Sincronizar Pedidos Portal Puma Energy-Latam
    try {
        console.log('[AutoSync Scheduler] [1/2] Sincronizando Pedidos Portal Puma Energy-Latam...');
        const runnerPortal = syncRunners.syncPortal || (() => energyLatamService.syncFromPortal(activeIo, null, 50));
        const pedidosRes = await runnerPortal();
        result.pedidos = {
            success: pedidosRes?.success !== false,
            count: pedidosRes?.count || 0,
            message: pedidosRes?.message || 'OK'
        };
        console.log(`[AutoSync Scheduler] [1/2] Pedidos portal finalizado:`, pedidosRes?.message || 'OK');
    } catch (pedidosErr) {
        console.error('[AutoSync Scheduler] [1/2] Error en sincronización de pedidos:', pedidosErr.message);
        result.pedidos = {
            success: false,
            error: pedidosErr.message
        };
    }

    // 2. Sincronizar Precios de Competencia DGEHM
    try {
        console.log('[AutoSync Scheduler] [2/2] Sincronizando Precios de Competencia DGEHM...');
        const runnerCompetencia = syncRunners.syncCompetencia || (() => syncDGEHM(activeIo));
        const compRes = await runnerCompetencia();
        result.preciosCompetencia = {
            success: compRes?.success !== false,
            count: compRes?.count || 0,
            total: compRes?.total || 0,
            message: compRes?.success ? `Actualizadas ${compRes.count} estaciones` : 'Error'
        };
        console.log(`[AutoSync Scheduler] [2/2] Precios de competencia finalizado: ${compRes?.count || 0} estaciones.`);
    } catch (compErr) {
        console.error('[AutoSync Scheduler] [2/2] Error en sincronización de precios de competencia:', compErr.message);
        result.preciosCompetencia = {
            success: false,
            error: compErr.message
        };
    }

    result.durationMs = Date.now() - startTime;
    lastSyncMetadata = {
        ...result,
        lastRunAt: runTimestamp
    };
    isSyncInProgress = false;

    console.log(`[AutoSync Scheduler] ✅ Ciclo de sincronización [${source}] completado en ${(result.durationMs / 1000).toFixed(1)}s.`);
    return result;
}

/**
 * Inicializa el cron job que ejecuta la sincronización 4 veces al día (8:00 AM, 11:00 AM, 2:00 PM, 4:00 PM)
 * @param {object|null} io - Instancia de Socket.io
 * @returns {object|null} Instancia de la tarea programada de cron o null si es réplica PM2
 */
function initAutoSyncScheduler(io = null) {
    if (io) {
        globalIo = io;
    }

    // Prevención de duplicidad bajo PM2 clúster: solo la instancia '0' ejecuta tareas programadas
    if (process.env.NODE_APP_INSTANCE !== undefined && process.env.NODE_APP_INSTANCE !== '0') {
        console.log(`[AutoSync Scheduler] Instancia secundaria PM2 (#${process.env.NODE_APP_INSTANCE}) detectada. Cron omitido para prevenir duplicidad.`);
        return null;
    }

    const scheduledTask = cron.schedule(AUTO_SYNC_CRON_EXPRESSION, async () => {
        const slotHour = new Date().toLocaleTimeString('es-SV', {
            timeZone: AUTO_SYNC_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        console.log(`[AutoSync Scheduler] ⏰ Despertador de sincronización disparado para turno: ${slotHour}`);
        lastSyncMetadata.lastScheduledSlot = slotHour;
        await executeAutoSyncCycle(globalIo, `CRON_${slotHour}`);
    }, {
        timezone: AUTO_SYNC_TIMEZONE
    });

    console.log(`[AutoSync Scheduler] Programador de sincronización automática inicializado:`);
    console.log(`[AutoSync Scheduler] Horarios: 08:00 AM, 11:00 AM, 02:00 PM, 04:00 PM (Zona horaria: ${AUTO_SYNC_TIMEZONE}).`);

    return scheduledTask;
}

/**
 * Retorna el estado actual de la programación y la última ejecución
 */
function getAutoSyncStatus() {
    return {
        enabled: true,
        hours: AUTO_SYNC_HOURS,
        formattedHours: AUTO_SYNC_FORMATTED_HOURS,
        timezone: AUTO_SYNC_TIMEZONE,
        cronExpression: AUTO_SYNC_CRON_EXPRESSION,
        isSyncInProgress,
        lastSync: lastSyncMetadata
    };
}

module.exports = {
    AUTO_SYNC_HOURS,
    AUTO_SYNC_FORMATTED_HOURS,
    AUTO_SYNC_CRON_EXPRESSION,
    AUTO_SYNC_TIMEZONE,
    executeAutoSyncCycle,
    initAutoSyncScheduler,
    getAutoSyncStatus
};
