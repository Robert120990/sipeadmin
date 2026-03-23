const { initDB } = require('./db');
const mysql = require('mysql2/promise');

async function test() {
    try {
        console.log('Connecting to local DB...');
        const db = await initDB();
        
        console.log('Fetching external config...');
        const [configs] = await db.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        
        if (configs.length === 0) {
            console.error('ERROR: No external config found in local DB.');
            process.exit(1);
        }
        
        const config = configs[0];
        console.log(`Connecting to external DB: ${config.host} / ${config.database_name}`);
        
        const externalDb = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database_name,
            port: config.port || 3306
        });
        
        console.log('Running Precios Competencia SQL...');
        const query = `
            SELECT 
                c.titulo, 
                a.estacion, 
                a.modificacion, 
                a.super_c, 
                a.regular_c, 
                a.ion_c, 
                a.diesel_c, 
                a.super_a, 
                a.regular_a, 
                a.ion_a, 
                a.diesel_a 
            FROM web_precios_competencia a 
            INNER JOIN web_estaciones_competencia b ON a.estacion = b.competencia 
            INNER JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION' 
            ORDER BY c.titulo, a.estacion
        `;
        
        const [rows] = await externalDb.query(query);
        console.log(`SUCCESS! Found ${rows.length} rows.`);
        if (rows.length > 0) {
            console.log('First row sample:', rows[0]);
        }
        
        await externalDb.end();
        await db.end();
        process.exit(0);
    } catch (error) {
        console.error('SQL ERROR:', error);
        process.exit(1);
    }
}

test();
