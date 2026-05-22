const mysql = require('mysql2/promise');

async function checkEmpresa() {
    const config = {
        host: '207.244.251.167',
        user: 'sysadmin',
        password: 'QwErTy123',
        database: 'db_system_rrs',
        port: 3306
    };

    const connection = await mysql.createConnection(config);

    try {
        const [rows] = await connection.query("SELECT id, nombre FROM empresas_mayores WHERE id = 'E-3'");
        console.log(JSON.stringify(rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkEmpresa();
