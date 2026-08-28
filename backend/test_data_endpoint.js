const { getDb, initDB } = require('./db');

async function test() {
    await initDB();
    const db = getDb();
    
    try {
        console.log('Testing validaciones_saldo_banco query...');
        const [vRows] = await db.query('SELECT * FROM validaciones_saldo_banco LIMIT 1');
        console.log('validaciones_saldo_banco OK, count:', vRows.length);
    } catch(e) {
        console.error('validaciones_saldo_banco ERROR:', e.message);
    }

    try {
        const [cuentas] = await db.query('SELECT * FROM cuentas_bancarias LIMIT 5');
        console.log('Cuentas in DB count:', cuentas.length);
        if (cuentas.length > 0) {
            const id = cuentas[0].id;
            console.log('Testing data endpoint logic for id:', id);

            const [[cuenta]] = await db.query(
                'SELECT cb.*, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
                'b.codigo as banco_codigo, b.descripcion as banco_nombre ' +
                'FROM cuentas_bancarias cb ' +
                'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
                'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
                'WHERE cb.id = ?',
                [id]
            );
            console.log('Cuenta found:', cuenta.nombre);

            const [[ultimaValidacion]] = await db.query(
                'SELECT * FROM validaciones_saldo_banco WHERE cuenta_bancaria_id = ? ORDER BY fecha_validacion DESC, id DESC LIMIT 1',
                [id]
            );
            console.log('ultimaValidacion:', ultimaValidacion);

            const [movs] = await db.query(
                'SELECT m.id, "MOV" as origen_tipo, m.tipo_remesa_id, tr.codigo as tipo_doc, ' +
                'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
                'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta ' +
                'FROM movimientos_bancarios m ' +
                'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
                'WHERE m.cuenta_bancaria_id = ? ' +
                'AND m.fecha_aplicado IS NOT NULL ' +
                'AND m.fecha_aplicado BETWEEN ? AND ? ' +
                'ORDER BY m.fecha_aplicado DESC, m.id DESC',
                [id, '2026-08-01', '2026-08-28']
            );
            console.log('movs OK:', movs.length);

            const [chks] = await db.query(
                'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
                'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
                'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta ' +
                'FROM cheques ch ' +
                'WHERE ch.cuenta_bancaria_id = ? ' +
                'AND ch.fecha_aplicado IS NOT NULL ' +
                'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE ' +
                'AND ch.fecha_aplicado BETWEEN ? AND ? ' +
                'ORDER BY ch.fecha_aplicado DESC, ch.id DESC',
                [id, '2026-08-01', '2026-08-28']
            );
            console.log('chks OK:', chks.length);

            const [pMovs] = await db.query(
                'SELECT m.id, "MOV" as origen_tipo, tr.codigo as tipo_doc, ' +
                'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
                'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta ' +
                'FROM movimientos_bancarios m ' +
                'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
                'WHERE m.cuenta_bancaria_id = ? ' +
                'AND (m.fecha_aplicado IS NULL OR m.fecha_aplicado > ?) ' +
                'AND m.fecha <= ? ' +
                'ORDER BY m.fecha DESC, m.id DESC',
                [id, '2026-08-28', '2026-08-28']
            );
            console.log('pMovs OK:', pMovs.length);

            const [pChks] = await db.query(
                'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
                'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
                'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta ' +
                'FROM cheques ch ' +
                'WHERE ch.cuenta_bancaria_id = ? ' +
                'AND (ch.fecha_aplicado IS NULL OR ch.fecha_aplicado > ?) ' +
                'AND ch.fecha <= ? ' +
                'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE ' +
                'ORDER BY ch.fecha DESC, ch.id DESC',
                [id, '2026-08-28', '2026-08-28']
            );
            console.log('pChks OK:', pChks.length);
        }
    } catch(e) {
        console.error('Query ERROR:', e.message);
    }
    process.exit(0);
}
test();
