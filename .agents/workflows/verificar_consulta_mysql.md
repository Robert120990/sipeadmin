---
description: Pasos para ejecutar y verificar manualmente cualquier consulta SQL antes de implementarla en el código.
---

Cuando necesites probar una consulta SQL en las bases de datos externas (Principal o Contabilidad) para asegurar que los campos y filtros sean correctos, sigue este procedimiento: 

1. **Crear script de prueba temporal**
Crea un archivo llamado `backend/test_sql_debug.js` con el siguiente contenido base:

```javascript
const mysql = require('mysql2/promise');
const { initDB } = require('./db');

async function check() {
    try {
        const pool = await initDB();
        // Cambiar 'accounting' por 'main' según la base de datos a probar
        const [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'accounting' LIMIT 1");
        const c = configs[0];
        const conn = await mysql.createConnection({ host: c.host, user: c.user, password: c.password, database: c.database_name, port: c.port || 3306 });
        
        // REEMPLAZAR AQUÍ CON TU CONSULTA
        const query = `SELECT * FROM empleados LIMIT 5`; 
        
        console.log('--- EJECUTANDO CONSULTA ---');
        const [rows] = await conn.query(query);
        console.log('RESULTADO:', JSON.stringify(rows, null, 2));

        await conn.end(); await pool.end();
    } catch (err) { console.error('ERROR SQL:', err.message); }
}
check();
```

2. **Ejecutar el script**
// turbo
Corre el comando `node backend/test_sql_debug.js` y revisa la salida en la terminal.

3. **Validación con usuario**
Si el resultado no es el esperado o si tienes dudas sobre los nombres de los campos (ej. `nombre_dui` vs `nombre`), **DETENTE** y pregunta al usuario confirmando los campos exactos antes de proceder con el código final.

4. **Limpieza**
Borra el archivo `backend/test_sql_debug.js` una vez confirmada la consulta.
