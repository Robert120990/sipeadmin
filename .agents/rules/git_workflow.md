# Reglas de Git, Commits y Sincronización Remota

Estas reglas son de cumplimiento obligatorio para cualquier cambio, commit o push en el repositorio de **SIPE Admin**.

---

## 1. Verificación y Sincronización Previa a cualquier Push
Antes de intentar cualquier `git push`, es **mandatorio** comprobar si existen commits o cambios en el repositorio remoto:

```bash
git fetch origin main
```

1. **Inspección de diferencias**:
   - Verificar si la rama remota tiene novedades:
     ```bash
     git log HEAD..origin/main --oneline
     ```
2. **Sincronización antes de empujar**:
   - Si existen cambios remotos, sincronizarlos obligatoriamente antes de pushear:
     ```bash
     git pull --rebase origin main
     ```
3. **Resolución preventiva de conflictos**:
   - Resolver cualquier conflicto manualmente asegurando la no regresión de ninguna funcionalidad nueva o preexistente.
   - Tras el rebase o fusión, ejecutar el suite de pruebas unitarias (`npm test`) y la compilación (`npm run build`) para garantizar integridad.

---

## 2. Commits Atómicos
Cada commit debe ser **atómico**:
- Debe contener una sola unidad lógica de trabajo (por ejemplo: la creación de un nuevo endpoint, la corrección de un bug puntual, la adición de una vista o componente).
- No mezclar refactorizaciones extensas con correcciones no relacionadas en el mismo commit.
- Facilitar la trazabilidad, reversión limpia (`git revert`) y auditoría del código.

---

## 3. Mensajes de Commit Estrictamente en Español
Todos los mensajes de commit DEBEN redactarse en **idioma español**, utilizando prefijos convencionales:

- `feat: [descripción]` — Para nuevas características o módulos (ej. `feat: agregar sistema de notificaciones en tiempo real`).
- `fix: [descripción]` — Para correcciones de errores o bugs (ej. `fix: corregir validación de clave secreta y arranque en producción`).
- `chore: [descripción]` — Para mantenimiento, bumps de versión o dependencias (ej. `chore: incrementar versión a 1.0.59`).
- `refactor: [descripción]` — Para mejoras en la estructura del código sin cambiar comportamiento (ej. `refactor: optimizar estilos y contraste del centro de notificaciones`).
- `test: [descripción]` — Para adición o mejora de pruebas automáticas (ej. `test: agregar pruebas unitarias para el módulo de tareas`).
- `docs: [descripción]` — Para cambios en documentación o lineamientos (ej. `docs: documentar reglas de commits y sincronización`).
