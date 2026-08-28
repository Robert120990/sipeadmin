const { getDb, initDB } = require('./db');

async function findNumber() {
    await initDB();
    const db = getDb();
    
    // Check all tables for 532380.86
    const [tables] = await db.query('SHOW TABLES');
    for (const t of tables) {
        const tableName = Object.values(t)[0];
        try {
            const [cols] = await db.query(`DESCRIBE ${tableName}`);
            const numCols = cols.filter(c => c.Type.includes('decimal') || c.Type.includes('float') || c.Type.includes('double') || c.Type.includes('int'));
            for (const c of numCols) {
                const [rows] = await db.query(`SELECT * FROM ${tableName} WHERE ${c.Field} BETWEEN 532380 AND 532381 OR ${c.Field} BETWEEN -532381 AND -532380`);
                if (rows.length > 0) {
                    console.log(`FOUND in table ${tableName}.${c.Field}:`, rows);
                }
            }
        } catch(e) {
            // ignore
        }
    }

    // Let's check total sum in movimientos_bancarios
    const [mSum] = await db.query('SELECT SUM(cargo) as cargos, SUM(abono) as abonos FROM movimientos_bancarios');
    console.log('Movimientos bancarios total sum in DB:', mSum[0]);

    // Check movements grouped by cuenta_bancaria_id
    const [allMovs] = await db.query('SELECT cuenta_bancaria_id, COUNT(*) as cnt, SUM(cargo) as cargos, SUM(abono) as abonos FROM movimientos_bancarios GROUP BY cuenta_bancaria_id');
    console.log('Movimientos by cuenta_bancaria_id:', allMovs);

    // Let's check Excel files or constants in codebase
    process.exit(0);
}
findNumber();
