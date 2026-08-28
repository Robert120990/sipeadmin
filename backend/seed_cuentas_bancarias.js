const { initDB, getDb } = require('./db');

async function seed() {
    await initDB();
    const db = getDb();

    console.log('Seeding empresas, bancos, tipos and cuentas...');

    // 1. Empresas
    const empresasList = [
        ['LIL', 'INVERSIONES LIL S.A. DE C.V.'],
        ['CDS', 'CORINA DE SOSA'],
        ['CDH', 'CORINA DE HERNÁNDEZ / CORSOSMEN'],
        ['RS', 'RAÚL RAFAEL SOSA CASTELLANOS'],
        ['ANDELSA', 'ANDELSA S.A. DE C.V.']
    ];

    for (const [cod, nom] of empresasList) {
        await db.query('INSERT IGNORE INTO empresas (codigo, nombre) VALUES (?, ?)', [cod, nom]);
    }

    const [empRows] = await db.query('SELECT id, codigo FROM empresas');
    const empMap = {};
    empRows.forEach(e => { empMap[e.codigo] = e.id; });

    // 2. Bancos
    const bancosList = [
        ['PROMERICA', 'BANCO PROMERICA'],
        ['BAC', 'BANCO AMERICA CENTRAL (BAC)'],
        ['DAVIVIENDA', 'BANCO DAVIVIENDA'],
        ['HIPOTECARIO', 'BANCO HIPOTECARIO'],
        ['CUSCATLAN', 'BANCO CUSCATLAN / CITIBANK'],
        ['AGRICOLA', 'BANCO AGRICOLA'],
        ['ATLANTIDA', 'BANCO ATLANTIDA'],
        ['ABANK', 'BANCO ABANK / CONSTELACION']
    ];

    for (const empCode of Object.keys(empMap)) {
        const empId = empMap[empCode];
        for (const [bCod, bNom] of bancosList) {
            await db.query(
                'INSERT IGNORE INTO bancos (empresa_id, codigo, descripcion) VALUES (?, ?, ?)',
                [empId, bCod, bNom]
            );
        }

        // Tipos de cuenta
        await db.query('INSERT IGNORE INTO tipos_cuenta_bancaria (empresa_id, codigo, descripcion) VALUES (?, "CTE", "CUENTA CORRIENTE")', [empId]);
        await db.query('INSERT IGNORE INTO tipos_cuenta_bancaria (empresa_id, codigo, descripcion) VALUES (?, "AHO", "CUENTA DE AHORRO")', [empId]);

        // Tipos de remesas
        await db.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "RM", "REMESA DIARIA")', [empId]);
        await db.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "NC", "NOTA DE CARGO")', [empId]);
        await db.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "NA", "NOTA DE ABONO")', [empId]);
        await db.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "CH", "CHEQUE")', [empId]);
    }

    // 3. Cuentas Bancarias
    const cuentasList = [
        // Empresa, Banco, Tipo, Numero, Nombre, CodCta
        ['LIL', 'PROMERICA', 'CTE', '10000046000186', 'PROMERICA #0186 - PISTA SAN MARTIN / LA LOMA', '11020101'],
        ['LIL', 'PROMERICA', 'CTE', '10000046000204', 'PROMERICA #0204 - TIENDA SAN MARTIN', '11020102'],
        ['LIL', 'BAC', 'CTE', '201114006', 'BAC #4006 - INVERSIONES LIL', '11020201'],
        ['LIL', 'HIPOTECARIO', 'CTE', '00480008460', 'HIPOTECARIO #8460 - TIENDA SAN MARTIN / LA LOMA', '11020301'],
        ['LIL', 'HIPOTECARIO', 'CTE', '00480008451', 'HIPOTECARIO #8451 - PISTA SAN MARTIN', '11020302'],
        ['LIL', 'ATLANTIDA', 'CTE', '6203016201724', 'ATLANTIDA #1724 - INVERSIONES LIL', '11020401'],

        ['CDS', 'PROMERICA', 'CTE', '10000033001900', 'PROMERICA #1900 - PISTA MIRAFLORES', '11020103'],
        ['CDS', 'PROMERICA', 'CTE', '10000060002375', 'PROMERICA #2375 - PISTA COSTA DEL SOL', '11020104'],
        ['CDS', 'BAC', 'CTE', '201034360', 'BAC #4360 - CORINA DE SOSA (MIRAFLORES/COSTA)', '11020202'],
        ['CDS', 'BAC', 'CTE', '201004116', 'BAC #4116 - CORINA DE SOSA', '11020203'],
        ['CDS', 'DAVIVIENDA', 'CTE', '15510057147', 'DAVIVIENDA #7147 - CORRIENTE CDS (TIENDA COSTA)', '11020501'],
        ['CDS', 'DAVIVIENDA', 'AHO', '15541116500', 'DAVIVIENDA #6500 - AHORRO CDS', '11020502'],
        ['CDS', 'CUSCATLAN', 'CTE', '008301000006066', 'CUSCATLAN #6066 - REMESAS CLIENTES CDS', '11020601'],
        ['CDS', 'CUSCATLAN', 'CTE', '6140002907', 'CUSCATLAN / SCOTIABANK #2907', '11020602'],
        ['CDS', 'CUSCATLAN', 'CTE', '00830100000656-1', 'CUSCATLAN #6561 - CITI CS', '11020603'],
        ['CDS', 'ATLANTIDA', 'CTE', '6203016200613', 'ATLANTIDA #0613 - CORINA DE SOSA', '11020402'],
        ['CDS', 'AGRICOLA', 'CTE', '555-625480-5', 'AGRICOLA #4805 - CORINA M DE SOSA', '11020701'],

        ['CDH', 'PROMERICA', 'CTE', '10000033001898', 'PROMERICA #1898 - PISTA EL DESVIO', '11020105'],
        ['CDH', 'PROMERICA', 'CTE', '10000033001899', 'PROMERICA #1899 - SUPER 7 EL DESVIO', '11020106'],
        ['CDH', 'DAVIVIENDA', 'CTE', '15510057155', 'DAVIVIENDA #7155 - CORRIENTE CDH', '11020503'],
        ['CDH', 'DAVIVIENDA', 'AHO', '15541116510', 'DAVIVIENDA #6510 - AHORRO CDH', '11020504'],
        ['CDH', 'AGRICOLA', 'CTE', '5000236631', 'AGRICOLA #6631 - LIOF CDH', '11020702'],
        ['CDH', 'ABANK', 'CTE', '11010000069670', 'ABANK #9670 - CONSTELACION CDH', '11020801'],

        ['RS', 'PROMERICA', 'CTE', '10000033001897', 'PROMERICA #1897 - PISTA CHALCHUAPA', '11020107'],
        ['RS', 'PROMERICA', 'CTE', '10000203003447', 'PROMERICA #3447 - E-MARKET CHALCHUAPA', '11020108'],
        ['RS', 'PROMERICA', 'CTE', '10000060002374', 'PROMERICA #2374 - RRS VENDING', '11020109'],
        ['RS', 'PROMERICA', 'CTE', '30001003012055', 'PROMERICA #2055 - E-MARKET MIRAFLORES', '11020110'],
        ['RS', 'BAC', 'CTE', '200281251', 'BAC #1251 - RAUL R SOSA', '11020204'],
        ['RS', 'AGRICOLA', 'CTE', '555-625106-8', 'AGRICOLA #1068 - SUPER EL PEDREGAL / RS', '11020703'],
        ['RS', 'AGRICOLA', 'CTE', '522860339-1', 'AGRICOLA #3391 - ATH CHALCHUAPA / RS EXENTA', '11020704'],
        ['RS', 'HIPOTECARIO', 'CTE', '00480008400', 'HIPOTECARIO #8400 - PISTA CHALCHUAPA', '11020303'],
        ['RS', 'HIPOTECARIO', 'CTE', '00480008435', 'HIPOTECARIO #8435 - PISTA DESVIO', '11020304'],
        ['RS', 'HIPOTECARIO', 'CTE', '00480008427', 'HIPOTECARIO #8427 - PISTA MIRAFLORES', '11020305'],
        ['RS', 'DAVIVIENDA', 'CTE', '040510022254', 'DAVIVIENDA #2254 - RAUL R SOSA', '11020505'],
        ['RS', 'ATLANTIDA', 'CTE', '3103013131112', 'ATLANTIDA #1112 - RAUL SOSA', '11020403']
    ];

    let order = 1;
    for (const [empCode, bCod, tCod, numero, nombre, codCta] of cuentasList) {
        const empId = empMap[empCode];
        if (!empId) continue;

        const [[bRow]] = await db.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [empId, bCod]);
        const [[tRow]] = await db.query('SELECT id FROM tipos_cuenta_bancaria WHERE empresa_id = ? AND codigo = ?', [empId, tCod]);

        if (bRow && tRow) {
            await db.query(
                'INSERT IGNORE INTO cuentas_bancarias (empresa_id, banco_id, tipo_cuenta_id, numero, nombre, cod_cta, activa, orden) ' +
                'VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)',
                [empId, bRow.id, tRow.id, numero, nombre, codCta, order++]
            );
        }
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
