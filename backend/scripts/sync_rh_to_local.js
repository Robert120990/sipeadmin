const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function syncRhData() {
    if (!process.env.VPS_DB_HOST || !process.env.VPS_DB_USER || !process.env.VPS_DB_PASSWORD) {
        throw new Error('Faltan variables de entorno VPS_DB_HOST, VPS_DB_USER o VPS_DB_PASSWORD para sincronización.');
    }

    console.log(`Connecting to VPS (${process.env.VPS_DB_HOST})...`);
    const vps = await mysql.createConnection({
        host: process.env.VPS_DB_HOST,
        user: process.env.VPS_DB_USER,
        password: process.env.VPS_DB_PASSWORD,
        database: process.env.VPS_DB_NAME || 'db_sistema_saas',
        connectTimeout: 10000
    });

    console.log('Connecting to local MySQL...');
    const local = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.SAAS_DB_NAME || 'db_sistema_saas',
        connectTimeout: 10000
    });

    console.log('Syncing RH tables...');
    const tables = [
        'companies',
        'branches',
        'rh_cargos',
        'rh_departamentos',
        'rh_cuentas_planillas',
        'rh_empleados',
        'rh_planillas',
        'rh_planilla_detalles'
    ];

    await local.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const t of tables) {
        try {
            const [createTable] = await vps.query(`SHOW CREATE TABLE \`${t}\``);
            const sql = createTable[0]['Create Table'];
            await local.query(`DROP TABLE IF EXISTS \`${t}\``);
            await local.query(sql);

            const [rows] = await vps.query(`SELECT * FROM \`${t}\``);
            if (rows.length > 0) {
                const keys = Object.keys(rows[0]);
                const cols = keys.map(k => '`' + k + '`').join(', ');
                const placeholders = keys.map(() => '?').join(', ');
                const insertSql = `INSERT INTO \`${t}\` (${cols}) VALUES (${placeholders})`;

                for (const row of rows) {
                    const values = keys.map(k => row[k]);
                    await local.execute(insertSql, values);
                }
            }
            console.log(`Synced table ${t}: ${rows.length} rows`);
        } catch (err) {
            console.error(`Error on table ${t}:`, err.message);
        }
    }

    await local.query('SET FOREIGN_KEY_CHECKS = 1');
    await vps.end();
    await local.end();
    console.log('All RH tables synced successfully to local db_sistema_saas!');
}

syncRhData().catch(console.error);
