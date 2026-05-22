const mysql = require('mysql2/promise');

async function checkConfig() {
    const config = {
        host: '207.244.251.167',
        user: 'sysadmin',
        password: 'QwErTy123',
        database: 'db_sipe_admin',
        port: 3306
    };

    const connection = await mysql.createConnection(config);

    try {
        console.log('--- EXTERNAL CONFIGS ---');
        const [configs] = await connection.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        console.log(JSON.stringify(configs, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkConfig();
