const dbModule = require('../db');
const { seedInitialPortalOrders } = require('./energyLatamService');
const { seedSolarEnergyData } = require('./solarEnergyService');

/**
 * Ejecuta la carga inicial de datos de servicios operativos una vez creada la estructura DDL en db.js.
 * Separar estas rutinas de db.js mantiene la capa de base de datos libre de dependencias circulares.
 */
async function runInitialServiceSeeds(customPool = null) {
    const pool = customPool || dbModule.getDb();
    if (!pool) return;

    try {
        const [orderCount] = await pool.query('SELECT COUNT(*) as c FROM portal_pedidos');
        if (orderCount && orderCount[0] && Number(orderCount[0].c) < 50) {
            await seedInitialPortalOrders(true);
        }
    } catch (e) {
        console.warn('[dbBootstrapSeeds] Seed portal_pedidos omitido o parcial:', e.message);
    }

    try {
        await seedSolarEnergyData(pool);
    } catch (e) {
        console.warn('[dbBootstrapSeeds] Seed energia_solar omitido o parcial:', e.message);
    }
}

module.exports = {
    runInitialServiceSeeds
};
