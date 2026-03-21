const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL);
        const [c] = await db.query('SELECT host, user, password, database_name as dbName, port FROM external_configs LIMIT 1');
        const edb = await mysql.createConnection({host:c[0].host, user:c[0].user, password:c[0].password, database:c[0].dbName, port:c[0].port});
        
        try {
            const query = `
                SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.forma_pago as observacion, 
                       a.forma_pago, b.monto, IF(a.estado = 'P','PENDIENTE','CANCELADO') as estado, a.fecha_cancelacion, a.id, b.id as id_recordatorio
                FROM web_rc_recordatorios_vencimientos a 
                INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
                INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
                WHERE a.vencimiento BETWEEN '2026-03-20' AND '2026-03-22' AND b.activo = 1 AND a.estado IN ('P', 'C')
                ORDER BY a.vencimiento
            `;
            await edb.query(query);
            console.log("QUERY SUCCESS");
        } catch(e) {
            console.error("SQL_ERROR:", e.message);
        }
        process.exit(0);
    } catch(e) {
        process.exit(1);
    }
}
run();
