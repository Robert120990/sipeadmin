const { getExternalDb } = require('../db');

async function up(extDb) {
    const ext = extDb || await getExternalDb();
    await ext.query(`
        CREATE TABLE IF NOT EXISTS web_precios_competencia_historial (
            id INT AUTO_INCREMENT PRIMARY KEY,
            estacion VARCHAR(150) NOT NULL,
            modificacion VARCHAR(50),
            fecha_registro DATE NOT NULL,
            super_c DOUBLE(15,2) DEFAULT 0,
            regular_c DOUBLE(15,2) DEFAULT 0,
            ion_c DOUBLE(15,2) DEFAULT 0,
            diesel_c DOUBLE(15,2) DEFAULT 0,
            super_a DOUBLE(15,2) DEFAULT 0,
            regular_a DOUBLE(15,2) DEFAULT 0,
            ion_a DOUBLE(15,2) DEFAULT 0,
            diesel_a DOUBLE(15,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_estacion_fecha (estacion, fecha_registro),
            INDEX idx_fecha (fecha_registro),
            UNIQUE KEY uk_estacion_fecha (estacion, fecha_registro)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Backfill current data
    try {
        const [current] = await ext.query('SELECT * FROM web_precios_competencia');
        const today = new Date().toISOString().split('T')[0];
        if (current.length > 0) {
            for (const row of current) {
                await ext.query(`
                    INSERT INTO web_precios_competencia_historial 
                    (estacion, modificacion, fecha_registro, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        modificacion = VALUES(modificacion),
                        super_c = VALUES(super_c),
                        regular_c = VALUES(regular_c),
                        ion_c = VALUES(ion_c),
                        diesel_c = VALUES(diesel_c),
                        super_a = VALUES(super_a),
                        regular_a = VALUES(regular_a),
                        ion_a = VALUES(ion_a),
                        diesel_a = VALUES(diesel_a)
                `, [
                    row.estacion, row.modificacion, today,
                    row.super_c, row.regular_c, row.ion_c, row.diesel_c,
                    row.super_a, row.regular_a, row.ion_a, row.diesel_a
                ]);
            }
            console.log(`[Migration] Backfilled ${current.length} baseline records into history with date ${today}.`);
        }
    } catch (err) {
        console.error('[Migration] Error backfilling data:', err.message);
    }
}

if (require.main === module) {
    const { initDB } = require('../db');
    (async () => {
        try {
            await initDB();
            await up();
            console.log('Migration executed successfully.');
        } catch (e) {
            console.error('Migration failed:', e);
        }
        process.exit(0);
    })();
}

module.exports = { up };
