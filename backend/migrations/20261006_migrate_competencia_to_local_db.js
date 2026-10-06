const { getDb, getExternalDb } = require('../db');

/**
 * Migration: Create web_consolidado, web_estaciones_competencia,
 * web_precios_competencia and web_precios_competencia_historial in db_sipe_admin
 * and backfill data from db_system_rrs if local tables are empty.
 */
async function up(targetDb = null, sourceDb = null) {
    const localDb = targetDb || await getDb();
    let extDb = sourceDb;

    console.log('[Migration 20261006] Ensuring competencia tables exist in local db_sipe_admin...');

    await localDb.query(`
        CREATE TABLE IF NOT EXISTS web_consolidado (
            id_empresa char(3) DEFAULT NULL,
            titulo varchar(50) DEFAULT NULL,
            grupo varchar(20) DEFAULT NULL,
            orden int DEFAULT NULL,
            letra char(1) NOT NULL DEFAULT '',
            cod_destino char(2) NOT NULL DEFAULT '',
            zona varchar(3) NOT NULL DEFAULT '',
            descarga_c char(1) NOT NULL DEFAULT 'N'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await localDb.query(`
        CREATE TABLE IF NOT EXISTS web_estaciones_competencia (
            ID int NOT NULL AUTO_INCREMENT,
            id_estacion varchar(3) DEFAULT NULL,
            competencia varchar(50) DEFAULT NULL,
            es_propia tinyint(1) NOT NULL DEFAULT 0,
            PRIMARY KEY (ID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await localDb.query(`
        CREATE TABLE IF NOT EXISTS web_precios_competencia (
            estacion varchar(100) DEFAULT NULL,
            modificacion varchar(50) DEFAULT NULL,
            super_c double(15,2) NOT NULL DEFAULT 0.00,
            regular_c double(15,2) NOT NULL DEFAULT 0.00,
            ion_c double(15,2) NOT NULL DEFAULT 0.00,
            diesel_c double(15,2) NOT NULL DEFAULT 0.00,
            super_a double(15,2) NOT NULL DEFAULT 0.00,
            regular_a double(15,2) NOT NULL DEFAULT 0.00,
            ion_a double(15,2) NOT NULL DEFAULT 0.00,
            diesel_a double(15,2) NOT NULL DEFAULT 0.00
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await localDb.query(`
        CREATE TABLE IF NOT EXISTS web_precios_competencia_historial (
            id int NOT NULL AUTO_INCREMENT,
            estacion varchar(150) NOT NULL,
            modificacion varchar(50) DEFAULT NULL,
            fecha_registro date NOT NULL,
            super_c double(15,2) DEFAULT 0.00,
            regular_c double(15,2) DEFAULT 0.00,
            ion_c double(15,2) DEFAULT 0.00,
            diesel_c double(15,2) DEFAULT 0.00,
            super_a double(15,2) DEFAULT 0.00,
            regular_a double(15,2) DEFAULT 0.00,
            ion_a double(15,2) DEFAULT 0.00,
            diesel_a double(15,2) DEFAULT 0.00,
            created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uk_estacion_fecha (estacion, fecha_registro),
            KEY idx_estacion_fecha (estacion, fecha_registro),
            KEY idx_fecha (fecha_registro)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Check if we need to copy from externalDb
    try {
        if (!extDb) {
            extDb = await getExternalDb().catch(() => null);
        }

        if (extDb) {
            const [cntConsolidado] = await localDb.query('SELECT COUNT(*) as cnt FROM web_consolidado');
            if (cntConsolidado[0].cnt === 0) {
                const [extConsolidado] = await extDb.query('SELECT * FROM web_consolidado');
                for (const r of (extConsolidado || [])) {
                    await localDb.query(
                        'INSERT INTO web_consolidado (id_empresa, titulo, grupo, orden, letra, cod_destino, zona, descarga_c) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [r.id_empresa, r.titulo, r.grupo, r.orden, r.letra, r.cod_destino, r.zona, r.descarga_c]
                    );
                }
                console.log(`[Migration 20261006] Copied ${(extConsolidado || []).length} rows to web_consolidado.`);
            }

            const [cntEst] = await localDb.query('SELECT COUNT(*) as cnt FROM web_estaciones_competencia');
            if (cntEst[0].cnt === 0) {
                const [extEst] = await extDb.query('SELECT * FROM web_estaciones_competencia');
                for (const r of (extEst || [])) {
                    await localDb.query(
                        'INSERT INTO web_estaciones_competencia (ID, id_estacion, competencia, es_propia) VALUES (?, ?, ?, ?)',
                        [r.ID, r.id_estacion, r.competencia, r.es_propia]
                    );
                }
                console.log(`[Migration 20261006] Copied ${(extEst || []).length} rows to web_estaciones_competencia.`);
            }

            const [cntPrecios] = await localDb.query('SELECT COUNT(*) as cnt FROM web_precios_competencia');
            if (cntPrecios[0].cnt === 0) {
                const [extPrecios] = await extDb.query('SELECT * FROM web_precios_competencia');
                for (const r of (extPrecios || [])) {
                    await localDb.query(
                        'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [r.estacion, r.modificacion, r.super_c, r.regular_c, r.ion_c, r.diesel_c, r.super_a, r.regular_a, r.ion_a, r.diesel_a]
                    );
                }
                console.log(`[Migration 20261006] Copied ${(extPrecios || []).length} rows to web_precios_competencia.`);
            }

            const [cntHist] = await localDb.query('SELECT COUNT(*) as cnt FROM web_precios_competencia_historial');
            if (cntHist[0].cnt === 0) {
                const [extHist] = await extDb.query('SELECT * FROM web_precios_competencia_historial');
                for (const r of (extHist || [])) {
                    await localDb.query(
                        'INSERT INTO web_precios_competencia_historial (id, estacion, modificacion, fecha_registro, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [r.id, r.estacion, r.modificacion, r.fecha_registro, r.super_c, r.regular_c, r.ion_c, r.diesel_c, r.super_a, r.regular_a, r.ion_a, r.diesel_a, r.created_at]
                    );
                }
                console.log(`[Migration 20261006] Copied ${(extHist || []).length} rows to web_precios_competencia_historial.`);
            }
        }
    } catch (copyErr) {
        console.warn('[Migration 20261006] Warning backfilling data from externalDb:', copyErr.message);
    }
}

if (require.main === module) {
    (async () => {
        try {
            await up();
            console.log('[Migration 20261006] Successfully finished.');
            process.exit(0);
        } catch (e) {
            console.error('[Migration 20261006] Failed:', e);
            process.exit(1);
        }
    })();
}

module.exports = { up };
