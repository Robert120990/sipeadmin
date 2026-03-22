const mysql = require('mysql2/promise');
const { initDB } = require('./db');
async function check() {
    try {
        const pool = await initDB();
        const [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'accounting' LIMIT 1");
        const c = configs[0];
        const conn = await mysql.createConnection({ host: c.host, user: c.user, password: c.password, database: c.database_name, port: c.port || 3306 });
        
        const [rows] = await conn.query("SELECT * FROM departamentos_personal LIMIT 5");
        console.log('SAMPLE DEPTOS:', JSON.stringify(rows, null, 2));

        await conn.end(); await pool.end();
    } catch (err) { console.error(err); }
}
check();
