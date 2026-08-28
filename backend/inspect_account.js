const { getDb, initDB } = require('./db');

async function inspect() {
    await initDB();
    const db = getDb();
    
    // Find account AGRICOLA - 5000236631
    const [rows] = await db.query('SELECT * FROM cuentas_bancarias WHERE numero LIKE ?', ['%5000236631%']);
    console.log('Account found:', rows);
    if (rows.length === 0) return process.exit(0);

    const ctaId = rows[0].id;
    
    // 1. Movimientos
    const [movs] = await db.query('SELECT COUNT(*) as cnt, SUM(abono) as total_abonos, SUM(cargo) as total_cargos FROM movimientos_bancarios WHERE cuenta_bancaria_id = ?', [ctaId]);
    console.log('Movimientos summary:', movs[0]);

    // 2. Cheques
    const [chks] = await db.query('SELECT COUNT(*) as cnt, SUM(valor) as total_cheques FROM cheques WHERE cuenta_bancaria_id = ? AND cheque_anulado = FALSE AND fue_noemitido = FALSE', [ctaId]);
    console.log('Cheques summary:', chks[0]);

    // 3. Sample records in cheques
    const [sampleChks] = await db.query('SELECT id, fecha, fecha_aplicado, cheque, valor, a_nombre, concepto FROM cheques WHERE cuenta_bancaria_id = ? ORDER BY id DESC LIMIT 5', [ctaId]);
    console.log('Sample cheques:', sampleChks);

    // 4. Sample records in movimientos
    const [sampleMovs] = await db.query('SELECT id, fecha, fecha_aplicado, documento, cargo, abono, concepto FROM movimientos_bancarios WHERE cuenta_bancaria_id = ? ORDER BY id DESC LIMIT 5', [ctaId]);
    console.log('Sample movimientos:', sampleMovs);

    // 5. Validaciones
    const [vals] = await db.query('SELECT * FROM validaciones_saldo_banco WHERE cuenta_bancaria_id = ?', [ctaId]);
    console.log('Validaciones:', vals);

    process.exit(0);
}
inspect();
