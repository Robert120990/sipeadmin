const mysql = require('mysql2/promise');

async function syncRhData() {
    console.log('Connecting to VPS (5.252.55.29)...');
    const vps = await mysql.createConnection({
        host: '5.252.55.29',
        user: 'sysadmin',
        password: 'QwErTy?123',
        database: 'db_sistema_saas',
        connectTimeout: 10000
    });

    console.log('Connecting to local MySQL (127.0.0.1)...');
    const local = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'QwErTy123',
        database: 'db_sistema_saas',
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
