const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL);
        const [c] = await db.query('SELECT host, user, password, database_name as dbName, port FROM external_configs LIMIT 1');
        const edb = await mysql.createConnection({host:c[0].host, user:c[0].user, password:c[0].password, database:c[0].dbName, port:c[0].port});
        const [cols] = await edb.query("SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME='web_pedidos_temp'");
        console.log("TEMP:", cols.map(c=>c.COLUMN_NAME).join(', '));
        const [cols2] = await edb.query("SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME='web_pedidos'");
        console.log("PEDIDOS:", cols2.map(c=>c.COLUMN_NAME).join(', '));
        
        // Let's add the columns if they don't exist
        const tempCols = cols.map(c=>c.COLUMN_NAME);
        if (!tempCols.includes('id_carrier_local')) {
            await edb.query("ALTER TABLE web_pedidos_temp ADD COLUMN id_carrier_local INT NULL");
            console.log("ADDED id_carrier_local to temp");
        }
        if (!tempCols.includes('id_tanker_local')) {
            await edb.query("ALTER TABLE web_pedidos_temp ADD COLUMN id_tanker_local INT NULL");
            console.log("ADDED id_tanker_local to temp");
        }

        const pedCols = cols2.map(c=>c.COLUMN_NAME);
        if (!pedCols.includes('id_carrier_local')) {
            await edb.query("ALTER TABLE web_pedidos ADD COLUMN id_carrier_local INT NULL");
            console.log("ADDED id_carrier_local to pedidos");
        }
        if (!pedCols.includes('id_tanker_local')) {
            await edb.query("ALTER TABLE web_pedidos ADD COLUMN id_tanker_local INT NULL");
            console.log("ADDED id_tanker_local to pedidos");
        }

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
