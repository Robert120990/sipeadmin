const mysql = require('mysql2/promise');

async function checkData() {
    const config = {
        host: '207.244.251.167',
        user: 'sysadmin',
        password: 'QwErTy123',
        database: 'db_system_rrs',
        port: 3306
    };

    const connection = await mysql.createConnection(config);

    try {
        console.log('--- TEST JOIN ---');
        const [test] = await connection.query(`
            SELECT m.numero_cuenta, m.id_empresa, b.descripcion as banco_nombre
            FROM movimientos_bancarios m
            LEFT JOIN cuentas_bancarias c ON TRIM(m.numero_cuenta) = TRIM(c.numero) AND TRIM(m.id_empresa) = TRIM(c.id_empresa)
            LEFT JOIN bancos b ON TRIM(c.cod_banco) = TRIM(b.id) AND TRIM(c.id_empresa) = TRIM(b.id_empresa)
            ORDER BY m.id DESC LIMIT 5
        `);
        console.log(JSON.stringify(test, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkData();
