---
description: Reglas y pasos para agregar correctamente un nuevo módulo o página al menú de navegación y permisos
---

Cuando necesites crear un nuevo módulo, pantalla o vista en el frontend del SIPE Admin, DEBES seguir siempre este flujo para asegurar que el sistema de Permisos lo detecte automáticamente.

### 1. Definir el Módulo en `navigation.js`
Ve al archivo `frontend/src/config/navigation.js` y asegúrate de agregar tu nueva ruta a la constante/categoría correcta. Por ejemplo:

```javascript
export const misNuevosModulos = [
    { name: 'Nueva Pantalla', path: '/dashboard/nuevo', icon: MiIcono }
];
```

### 2. ¡CRÍTICO! Registrar en `allNavCategories`
Este paso es **obligatorio** para que la pantalla de "Permisos" reconozca el módulo nuevo y permita a los administradores asignar roles.

Ve al final del archivo `navigation.js` y agrega la categoría al arreglo `allNavCategories`:

```javascript
// AL FINAL DE navigation.js:
export const allNavCategories = [
    { title: 'Principal', items: mainNavItems },
    // ... otras categorias
    { title: 'Mi Nuevo Grupo', items: misNuevosModulos }, // <- AGREGAR AQUÍ
    // ... 
];
```

### 3. Registrar las Rutas en `App.jsx`
Una vez creado en la navegación, debes declararlo como una vista protegida dentro de `frontend/src/App.jsx` envolviéndolo en `PermissionRoute` (si requiere restricción de rol) utilizando exactamente el mismo `path` que declaraste en `navigation.js`:

```jsx
<Route path="nuevo" element={<PermissionRoute pathKey="/dashboard/nuevo"><NuevaPantalla /></PermissionRoute>} />
```

Al seguir estrictamente estos 3 pasos, tu módulo aparecerá en la barra lateral y en el sistema de gestión de roles automáticamente.
