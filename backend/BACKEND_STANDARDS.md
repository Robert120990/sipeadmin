# Estándares del Backend - SIPE Admin

Para asegurar que el sistema siga creciendo de forma organizada y evitar archivos gigantes que causen errores de sintaxis, se deben seguir estas reglas:

## 1. Estructura de Archivos
- **`/backend/server.js`**: Únicamente para configuración global del servidor, middlewares globales y registro de rutas. No debe contener lógica de negocio.
- **`/backend/routes/`**: Aquí deben residir todos los archivos de rutas. Cada archivo debe agrupar funcionalidades relacionadas (ej. `bancos.js`, `usuarios.js`).
- **`/backend/middleware/`**: Para middlewares reutilizables como autenticación (`auth.js`).
- **`/backend/db.js`**: Único lugar para la lógica de conexión y acceso a bases de datos (Local y Externa).

## 2. Creación de Nuevos Módulos
Al agregar una nueva funcionalidad (ej. "Inventarios"):
1. Crear un archivo `backend/routes/inventarios.js`.
2. Usar `express.Router()`.
3. Importar los helpers de base de datos con `const { getDb, getExternalDb } = require('../db');`.
4. Importar el middleware de autenticación con `const { authenticateToken } = require('../middleware/auth');`.
5. Exportar el router: `module.exports = router;`.
6. Registrar el router en `server.js`:
   ```javascript
   const inventariosRoutes = require('./routes/inventarios');
   app.use('/api/inventarios', inventariosRoutes);
   ```

## 3. Manejo de Errores
- Todos los endpoints deben usar bloques `try/catch`.
- Los errores deben loguearse en consola y devolver un status `500` con un mensaje claro al frontend.
- Usar `(concepto || '').toUpperCase()` para campos que el usuario solicitó siempre en mayúsculas.

## 4. WebSockets
- Usar `req.io` dentro de las rutas para emitir eventos en tiempo real hacia el frontend.
- Los eventos deben tener nombres descriptivos (ej. `stock_updated`).

## 5. Base de Datos Externa
- Siempre usar `await getExternalDb()` para interactuar con `db_system_rrs`.
- No crear pools locales dentro de las rutas; usar siempre el pool centralizado en `db.js`.
