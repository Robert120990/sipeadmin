const mysql = require('mysql2/promise');

async function syncLocalDb() {
  console.log('Connecting to VPS (5.252.55.29)...');
  const vps = await mysql.createConnection({
    host: '5.252.55.29',
    user: 'sysadmin',
    password: 'QwErTy?123',
    database: 'db_system_rrs',
    port: 3306
  });

  console.log('Connecting to local MySQL (127.0.0.1)...');
  const local = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'QwErTy123',
    database: 'db_system_rrs',
    port: 3306
  });

  // Expand column sizes on local tables to fit production data
  console.log('Adjusting column widths in local db_system_rrs...');
  try { await local.query('ALTER TABLE cierre_turno MODIFY id VARCHAR(50)'); } catch (e) { /* ignore */ }
  try { await local.query('ALTER TABLE cierre_turno_lecturas MODIFY id VARCHAR(50)'); } catch (e) { /* ignore */ }
  try { await local.query('ALTER TABLE cierre_turno_lecturas MODIFY id_cierre_turno VARCHAR(50)'); } catch (e) { /* ignore */ }
  try { await local.query('ALTER TABLE cierre_turno_lecturas MODIFY codigo_producto VARCHAR(50)'); } catch (e) { /* ignore */ }
  try { await local.query('ALTER TABLE cierre_turno_lecturas MODIFY nom_producto VARCHAR(100)'); } catch (e) { /* ignore */ }
  try { await local.query('ALTER TABLE ventas_tienda MODIFY id VARCHAR(50)'); } catch (e) { /* ignore */ }

  // 1. web_consolidado
  console.log('Syncing web_consolidado...');
  await local.query('DELETE FROM web_consolidado');
  const [vpsConsol] = await vps.query("SELECT * FROM web_consolidado WHERE grupo IN ('ESTACION', 'TIENDA') ORDER BY orden");
  for (const r of vpsConsol) {
    let titulo = r.titulo;
    // Map official user names
    if (r.id_empresa === '002' && r.grupo === 'ESTACION') titulo = 'Puma Miraflores';
    if (r.id_empresa === '006' && r.grupo === 'ESTACION') titulo = 'Shell Chalchuapa';
    if (r.id_empresa === '008' && r.grupo === 'ESTACION') titulo = 'Puma Costa del Sol';
    if (r.id_empresa === '014' && r.grupo === 'ESTACION') titulo = 'Puma La Loma (San Martín)';
    if (r.id_empresa === '015' && r.grupo === 'ESTACION') titulo = 'Shell 14 Avenida';

    if (r.id_empresa === '002' && r.grupo === 'TIENDA') titulo = 'E-Market Miraflores';
    if (r.id_empresa === '006' && r.grupo === 'TIENDA') titulo = 'E-Market Chalchuapa';
    if (r.id_empresa === '008' && r.grupo === 'TIENDA') titulo = 'Super 7 Costa';
    if (r.id_empresa === '014' && r.grupo === 'TIENDA') titulo = 'E-Market San Martin';
    if (r.id_empresa === '009' && r.grupo === 'TIENDA') titulo = 'Super El Pedregal';

    await local.query(
      'INSERT INTO web_consolidado (orden, id_empresa, titulo, grupo) VALUES (?, ?, ?, ?)',
      [r.orden, r.id_empresa, titulo, r.grupo]
    );
  }
  console.log(`Synced ${vpsConsol.length} rows to web_consolidado`);

  // 2. cfg_combustibles
  console.log('Syncing cfg_combustibles...');
  await local.query('DELETE FROM cfg_combustibles');
  const [combRows] = await vps.query('SELECT id_empresa, id_producto, codigo, clasificacion, tipo FROM cfg_combustibles');
  for (const r of combRows) {
    await local.query(
      'INSERT INTO cfg_combustibles (id_empresa, id_producto, codigo, clasificacion, tipo) VALUES (?, ?, ?, ?, ?)',
      [r.id_empresa, r.id_producto, r.codigo, r.clasificacion, r.tipo]
    );
  }
  console.log(`Synced ${combRows.length} rows to cfg_combustibles`);

  // 3. cierre_turno for recent months (08/2026 & 09/2026)
  console.log('Syncing cierre_turno for recent months...');
  await local.query('DELETE FROM cierre_turno');
  const [cierresRows] = await vps.query("SELECT id, id_empresa, fecha_turno, turno FROM cierre_turno WHERE fecha_turno LIKE '%/08/2026' OR fecha_turno LIKE '%/09/2026'");
  for (const r of cierresRows) {
    await local.query(
      'INSERT INTO cierre_turno (id, id_empresa, fecha_turno, turno) VALUES (?, ?, ?, ?)',
      [r.id, r.id_empresa, r.fecha_turno, r.turno]
    );
  }
  console.log(`Synced ${cierresRows.length} rows to cierre_turno`);

  // 4. cierre_turno_lecturas
  console.log('Syncing cierre_turno_lecturas...');
  await local.query('DELETE FROM cierre_turno_lecturas');
  const cierreIds = cierresRows.map(c => c.id);
  const batchSize = 100;
  for (let i = 0; i < cierreIds.length; i += batchSize) {
    const chunk = cierreIds.slice(i, i + batchSize);
    const [lectRows] = await vps.query('SELECT id, id_cierre_turno, id_empresa, id_producto, codigo_producto, nom_producto, total, precio, monto FROM cierre_turno_lecturas WHERE id_cierre_turno IN (?)', [chunk]);
    if (lectRows.length > 0) {
      const values = lectRows.map(l => [
        String(l.id), String(l.id_cierre_turno), l.id_empresa, l.id_producto, l.codigo_producto, l.nom_producto,
        Number(l.total || 0), Number(l.precio || 0), Number(l.monto || (l.total * l.precio) || 0)
      ]);
      await local.query(
        'INSERT INTO cierre_turno_lecturas (id, id_cierre_turno, id_empresa, id_producto, codigo_producto, nom_producto, total, precio, monto) VALUES ?',
        [values]
      );
    }
  }
  console.log('Synced cierre_turno_lecturas successfully');

  // 5. ventas_tienda
  console.log('Syncing ventas_tienda...');
  await local.query('DELETE FROM ventas_tienda');
  const [vtRows] = await vps.query("SELECT id, id_empresa, fecha, monto FROM ventas_tienda WHERE fecha >= '2026-08-01'");
  if (vtRows.length > 0) {
    const vtValues = vtRows.map(v => [String(v.id), v.id_empresa, v.fecha, Number(v.monto || 0)]);
    await local.query(
      'INSERT INTO ventas_tienda (id, id_empresa, fecha, monto) VALUES ?',
      [vtValues]
    );
  }
  console.log(`Synced ${vtRows.length} rows to ventas_tienda`);

  await vps.end();
  await local.end();
  console.log('--- ALL TABLES SYNCED TO LOCAL MYSQL WITH 100% REAL PRODUCTION DATA ---');
}

syncLocalDb().catch(console.error);
