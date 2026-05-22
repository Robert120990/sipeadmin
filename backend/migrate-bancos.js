/**
 * migrate-bancos.js
 *
 * Script standalone para migrar datos del módulo de bancos
 * desde la base de datos externa a la base de datos principal (SIPE Admin).
 *
 * Ejecución: node backend/migrate-bancos.js
 *
 * Comportamiento:
 * - Borra los datos existentes en las tablas del módulo bancos en la DB principal
 * - Lee los datos desde la DB externa
 * - Re-inserta los datos con la nueva estructura (IDs autoincrementales, DATE, etc.)
 * - Es idempotente: se puede ejecutar las veces que sea necesario
 */

const { initDB, getDb, getExternalDb } = require('./db');

const toDBDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

async function migrate() {
    console.log('=== INICIO DE MIGRACIÓN DE BANCOS ===\n');

    console.log('[1/6] Inicializando conexión a DB principal...');
    await initDB();
    const db = getDb();
    console.log('  OK - Conectado a DB principal.\n');

    console.log('[2/6] Conectando a DB externa...');
    const externalDb = await getExternalDb();
    console.log('  OK - Conectado a DB externa.\n');

    // Asegurar schema actualizado en DB principal
    console.log('[2.5/6] Verificando schema en DB principal...');
    try { await db.query('ALTER TABLE movimientos_bancarios ADD COLUMN num_partida VARCHAR(50) AFTER tipo_remesa_id'); console.log('  - Columna num_partida agregada.'); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('  - num_partida ya existe o error:', e.code); }
    try { await db.query('ALTER TABLE movimientos_bancarios DROP FOREIGN KEY movimientos_bancarios_ibfk_4'); } catch(e) { /* puede no existir */ }
    try { await db.query('ALTER TABLE movimientos_bancarios DROP COLUMN destino_cheque_id'); console.log('  - Columna destino_cheque_id eliminada.'); } catch(e) { if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') console.log('  - destino_cheque_id ya eliminado.'); }
    try { await db.query('ALTER TABLE cheques DROP COLUMN correlativo'); } catch(e) {}
    try { await db.query('ALTER TABLE cheques DROP COLUMN cod_tipo_partida'); } catch(e) {}
    console.log('  OK - Schema verificado.\n');

    // ========== 1. EMPRESAS ==========
    console.log('[3/6] Migrando empresas...');
    const [extEmpresas] = await externalDb.query('SELECT TRIM(id) as id, nombre FROM empresas_mayores ORDER BY nombre');

    await db.query('DELETE FROM movimientos_bancarios');
    await db.query('DELETE FROM cheques');
    await db.query('DELETE FROM cuentas_bancarias');
    try { await db.query('DELETE FROM destinos_cheques'); } catch(e) {}
    try { await db.query('DROP TABLE IF EXISTS destinos_cheques'); } catch(e) {}
    await db.query('DELETE FROM tipos_remesas');
    await db.query('DELETE FROM tipos_cuenta_bancaria');
    await db.query('DELETE FROM bancos');
    await db.query('DELETE FROM empresas');

    const empresaMap = new Map();
    for (const emp of extEmpresas) {
        const [result] = await db.query('INSERT INTO empresas (codigo, nombre) VALUES (?, ?)', [emp.id, emp.nombre]);
        empresaMap.set(emp.id, result.insertId);
    }
    console.log(`  OK - ${extEmpresas.length} empresas migradas.\n`);

    // ========== 2. CATÁLOGOS (bancos, tipos_cuenta, tipos_remesas) ==========
    console.log('[4/6] Migrando catálogos...');

    const upsertCatalogo = async (table, empresaId, codigo, descripcion) => {
        await db.query(
            `INSERT INTO ${table} (empresa_id, codigo, descripcion) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)`,
            [empresaId, codigo, descripcion]
        );
        const [rows] = await db.query(`SELECT id FROM ${table} WHERE empresa_id = ? AND codigo = ?`, [empresaId, codigo]);
        return rows[0].id;
    };

    const [extBancos] = await externalDb.query('SELECT TRIM(id) as id, TRIM(id_empresa) as id_empresa, descripcion FROM bancos');
    const bancoMap = new Map();
    let bancoCount = 0;
    for (const b of extBancos) {
        const empresaId = empresaMap.get(b.id_empresa);
        if (!empresaId) continue;
        const newId = await upsertCatalogo('bancos', empresaId, b.id, b.descripcion);
        bancoMap.set(`${b.id_empresa}:${b.id}`, newId);
        bancoCount++;
    }
    console.log(`  OK - ${bancoCount} bancos migrados.`);

    const [extTiposCuenta] = await externalDb.query('SELECT TRIM(id) as id, TRIM(id_empresa) as id_empresa, descripcion FROM tipos_cuenta_bancaria');
    const tipoCuentaMap = new Map();
    let tipoCuentaCount = 0;
    for (const t of extTiposCuenta) {
        const empresaId = empresaMap.get(t.id_empresa);
        if (!empresaId) continue;
        const newId = await upsertCatalogo('tipos_cuenta_bancaria', empresaId, t.id, t.descripcion);
        tipoCuentaMap.set(`${t.id_empresa}:${t.id}`, newId);
        tipoCuentaCount++;
    }
    console.log(`  OK - ${tipoCuentaCount} tipos de cuenta migrados.`);

    const [extRemesas] = await externalDb.query('SELECT TRIM(id) as id, TRIM(id_empresa) as id_empresa, descripcion FROM tipos_remesas');
    const remesaMap = new Map();
    let remesaCount = 0;
    for (const r of extRemesas) {
        const empresaId = empresaMap.get(r.id_empresa);
        if (!empresaId) continue;
        const newId = await upsertCatalogo('tipos_remesas', empresaId, r.id, r.descripcion);
        remesaMap.set(`${r.id_empresa}:${r.id}`, newId);
        remesaCount++;
    }
    console.log(`  OK - ${remesaCount} tipos de remesa migrados.\n`);

    // ========== 3. CUENTAS BANCARIAS ==========
    console.log('[5/6] Migrando cuentas bancarias...');
    const [extCuentas] = await externalDb.query(
        'SELECT MIN(corr) as corr, TRIM(id_empresa) as id_empresa, numero, ' +
        'MAX(nombre) as nombre, MAX(TRIM(cod_banco)) as cod_banco, ' +
        'MAX(TRIM(cod_tipo)) as cod_tipo, MAX(cod_cta) as cod_cta, ' +
        'MAX(activa) as activa, MAX(orden) as orden ' +
        'FROM cuentas_bancarias GROUP BY TRIM(id_empresa), numero'
    );
    const cuentaMap = new Map();
    let cuentaCount = 0;
    for (const c of extCuentas) {
        const empresaId = empresaMap.get(c.id_empresa);
        if (!empresaId) continue;
        const bancoId = bancoMap.get(`${c.id_empresa}:${c.cod_banco}`);
        const tipoCuentaId = tipoCuentaMap.get(`${c.id_empresa}:${c.cod_tipo}`);
        if (!bancoId || !tipoCuentaId) continue;

        const activaBool = c.activa === 'S' ? 1 : 0;
        await db.query(
            'INSERT INTO cuentas_bancarias (empresa_id, banco_id, tipo_cuenta_id, numero, nombre, cod_cta, activa, orden) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), banco_id = VALUES(banco_id), tipo_cuenta_id = VALUES(tipo_cuenta_id), cod_cta = VALUES(cod_cta), activa = VALUES(activa), orden = VALUES(orden)',
            [empresaId, bancoId, tipoCuentaId, c.numero, c.nombre, c.cod_cta, activaBool, c.orden || 0]
        );
        const [cuentaRows] = await db.query('SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ?', [empresaId, c.numero]);
        cuentaMap.set(`${c.id_empresa}:${c.numero}`, cuentaRows[0].id);
        cuentaCount++;
    }
    console.log(`  OK - ${cuentaCount} cuentas bancarias migradas.\n`);

    // ========== 4. MOVIMIENTOS BANCARIOS ==========
    console.log('[6/6] Migrando movimientos bancarios...');
    const [extMovimientos] = await externalDb.query(
        'SELECT id, llave, TRIM(id_empresa) as id_empresa, numero_cuenta, fecha, fecha_aplicado, ' +
        'documento, concepto, monto, cargo, abono, cod_remesa, cod_cta, es_contabilizado, num_partida ' +
        'FROM movimientos_bancarios ORDER BY id'
    );
    console.log(`  Leyendo ${extMovimientos.length} movimientos desde DB externa...`);

    const BATCH_SIZE = 500;
    let movCount = 0;
    let skippedCount = 0;
    let batch = [];

    const flushBatch = async () => {
        if (batch.length === 0) return;
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = batch.flat();
        await db.query(
            `INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, es_contabilizado, num_partida) VALUES ${placeholders}`,
            values
        );
        movCount += batch.length;
        console.log(`  Progreso: ${movCount}/${extMovimientos.length} movimientos migrados...`);
        batch = [];
    };

    for (const m of extMovimientos) {
        const empresaId = empresaMap.get(m.id_empresa);
        if (!empresaId) { skippedCount++; continue; }

        const cuentaBancariaId = cuentaMap.get(`${m.id_empresa}:${m.numero_cuenta}`);
        if (!cuentaBancariaId) { skippedCount++; continue; }

        const remesaId = m.cod_remesa ? remesaMap.get(`${m.id_empresa}:${m.cod_remesa}`) : null;

        const dbFecha = toDBDate(m.fecha);
        const dbFechaAplicado = toDBDate(m.fecha_aplicado);

        const esContBool = m.es_contabilizado === 'S' ? 1 : 0;

        batch.push([empresaId, cuentaBancariaId, dbFecha, dbFechaAplicado, m.documento, m.concepto, m.monto, m.cargo, m.abono, remesaId, m.cod_cta, esContBool, m.num_partida || null]);

        if (batch.length >= BATCH_SIZE) {
            await flushBatch();
        }
    }
    await flushBatch();

    console.log(`  OK - ${movCount} movimientos migrados.`);
    if (skippedCount > 0) {
        console.log(`  ADVERTENCIA - ${skippedCount} movimientos omitidos por referencias huérfanas.\n`);
    } else {
        console.log('');
    }

    // ========== 5. CHEQUES ==========
    console.log('[7/7] Migrando cheques...');
    const [extCheques] = await externalDb.query(
        'SELECT id_empresa, llave, fecha, cheque_anulado, ' +
        'numero_cuenta, cheque, valor, a_nombre, fecha_aplicado, concepto, ' +
        'es_reservado, es_contabilizado, es_pago_contado, fue_noemitido, num_partida ' +
        'FROM vouchers ORDER BY llave'
    );
    console.log(`  Leyendo ${extCheques.length} cheques desde DB externa...`);

    const chequesBatchSize = 500;
    let chequeCount = 0;
    let chequeSkipped = 0;
    let chequeBatch = [];

    const flushChequeBatch = async () => {
        if (chequeBatch.length === 0) return;
        const placeholders = chequeBatch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = chequeBatch.flat();
        await db.query(
            `INSERT INTO cheques (empresa_id, cuenta_bancaria_id, llave, fecha, cheque_anulado, cheque, valor, a_nombre, fecha_aplicado, concepto, es_reservado, es_contabilizado, es_pago_contado, fue_noemitido, num_partida) VALUES ${placeholders}`,
            values
        );
        chequeCount += chequeBatch.length;
        console.log(`  Progreso: ${chequeCount}/${extCheques.length} cheques migrados...`);
        chequeBatch = [];
    };

    for (const v of extCheques) {
        const empresaId = empresaMap.get(v.id_empresa ? v.id_empresa.trim() : '');
        if (!empresaId) { chequeSkipped++; continue; }

        const cuentaBancariaId = cuentaMap.get(`${v.id_empresa ? v.id_empresa.trim() : ''}:${v.numero_cuenta}`);
        if (!cuentaBancariaId) { chequeSkipped++; continue; }

        const dbFecha = toDBDate(v.fecha);
        const dbFechaAplicado = toDBDate(v.fecha_aplicado);

        chequeBatch.push([
            empresaId, cuentaBancariaId, v.llave,
            dbFecha, v.cheque_anulado, v.cheque, v.valor, v.a_nombre,
            dbFechaAplicado, v.concepto,
            v.es_reservado, v.es_contabilizado === 'S' ? 1 : 0,
            v.es_pago_contado, v.fue_noemitido === 'S' ? 1 : 0,
            v.num_partida || null
        ]);

        if (chequeBatch.length >= chequesBatchSize) {
            await flushChequeBatch();
        }
    }
    await flushChequeBatch();

    console.log(`  OK - ${chequeCount} cheques migrados.`);
    if (chequeSkipped > 0) {
        console.log(`  ADVERTENCIA - ${chequeSkipped} cheques omitidos por referencias huérfanas.\n`);
    } else {
        console.log('');
    }

    console.log('=== MIGRACIÓN COMPLETADA EXITOSAMENTE ===');
    process.exit(0);
}

migrate().catch(err => {
    console.error('ERROR EN MIGRACIÓN:', err.message);
    console.error(err);
    process.exit(1);
});
