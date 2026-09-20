---
description: Estándar para crear nuevas pantallas, consultas, tablas, formularios y reportes con vista previa (ReportPreviewModal)
---

Cuando necesites crear una nueva vista de "Consulta", tabla de datos, sección de reporte, formulario o cualquier pantalla en el frontend del SIPE Admin, DEBES cumplir estrictamente con este estándar.

---

### 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)

Para evitar pantallas con elementos sobredimensionados o desproporcionados, toda interfaz debe seguir estas directrices:

#### A. Jerarquía y Espaciados
- **Contenedor Principal**: Usar `display: 'flex', flexDirection: 'column', gap: '1rem'`.
- **Encabezado (`.page-header`)**: Margen inferior compacto (`marginBottom: '0.75rem'` a `'1rem'`), título con `fontSize: '1.2rem'` a `'1.25rem'` con icono representativo de `20-22px`, y subtítulo descriptivo en `0.8rem` con `var(--text-muted)`.
- **Tarjetas / Cards de Filtro (`card glass`)**: Padding compacto de `1rem 1.25rem`.

#### B. Controles de Formulario e Inputs
- **Altura estándar**: `36px` a `38px` (nunca `42px` gigantescos en filtros).
- **Tipografía**: `fontSize: '0.825rem'`, padding `0.35rem 0.65rem`.
- **Campos Numéricos, Rangos y Códigos**: NUNCA expandir a columnas completas de 400px o `1fr` abierto. Usar anchos fijos proporcionales:
  - Campos de rango como "Desde #", "Hasta #": `width: '110px'` a `'130px'`.
  - Códigos o números cortos: `width: '100px'` a `'140px'`.
- **Botones de Búsqueda / Acción**: Alineados inline con los filtros (`height: '36px'`, `padding: '0 1.25rem'`, `fontSize: '0.825rem'`).
- **Checkboxes y Radios**: Siempre tamaño compacto estándar de `16px` (`width: 16px; height: 16px;`). Etiquetas inline con `display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; cursor: pointer; user-select: none;`.

#### C. Selectores de Cuentas Bancarias
En CUALQUIER selector de cuentas bancarias del sistema, es **OBLIGATORIO** utilizar los helpers centralizados de `src/utils/cuentaUtils.js`:
```jsx
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

// En el select:
<select className="form-control" value={selectedCuentaId} onChange={...}>
    <option value="">-- Seleccionar cuenta bancaria --</option>
    {sortCuentas(cuentas).map(c => (
        <option key={c.corr} value={c.corr}>
            {formatCuentaLabel(c)}
        </option>
    ))}
</select>
```
*Formato producido*: `[banco] nombre de la cuenta - (numero de cuenta)` (ej: `[BAC] CUENTA PRINCIPAL - (201004116)`). Ordenado alfabéticamente por banco y luego por número de cuenta.

#### D. Tablas de Datos Compactas y Densas
- **Contenedor**: SIEMPRE envolver la tabla en `<div className="table-responsive">` con `minWidth: '800px'` a `'1100px'` para permitir scroll horizontal fluido en pantallas pequeñas.
- **Encabezados (`<th>`)**: `padding: '0.45rem 0.5rem'`, `fontSize: '0.74rem'`, `textTransform: 'uppercase'`, `letterSpacing: '0.03em'`, color `var(--text-muted)`.
- **Celdas (`<td>`)**: `padding: '0.45rem 0.5rem'`, `fontSize: '0.8rem'`.
- **Badges de Estado**: `fontSize: '0.72rem'`, `padding: '0.15rem 0.45rem'`, bordes redondeados (`4px` a `6px`).
- **Filas seleccionables**: Resaltar fondo suave con `rgba(37, 99, 235, 0.06)` y checkboxes de selección alineados al centro.

---

### 2. Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)

Toda pantalla que genere, consulte o imprima reportes contables, cheques, comprobantes o listados oficiales **DEBE** utilizar el componente compartido `ReportPreviewModal` (`src/components/ReportPreviewModal.jsx`).

#### Reglas Obligatorias de Impresión
1. **Prohibido disparar `window.print()` directo** sin antes ofrecer la previsualización al usuario en el modal.
2. **Página Completa Carta (`Letter: 215.9mm x 279.4mm`)**: Todo PDF o documento generado para impresión debe estructurarse a tamaño Carta completo. No recortar la hoja al tamaño físico del documento para evitar problemas de escalado en impresoras estándar.
3. El modal incluye visor PDF nativo, navegador de páginas (`< PÁG. 1 / N >`), botón de Descarga, botón de Imprimir, abrir en pestaña externa y atajos de teclado (`ESC`, `←`, `→`).

#### Ejemplo de Integración
```jsx
import React, { useState } from 'react';
import ReportPreviewModal from '../components/ReportPreviewModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function MiReporte() {
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewPages, setPreviewPages] = useState(1);

    const handleGenerarReporte = () => {
        // 1. Crear documento Letter
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter' // 215.9 x 279.4 mm obligatorio
        });

        // 2. Construir contenido o tablas
        doc.setFontSize(14);
        doc.text('Título del Reporte', 14, 15);
        autoTable(doc, {
            startY: 25,
            head: [['Código', 'Descripción', 'Monto']],
            body: [['001', 'Item de ejemplo', '$150.00']],
            styles: { fontSize: 8, cellPadding: 2 }
        });

        // 3. Extraer blob y total de páginas
        const blob = doc.output('blob');
        const total = doc.internal.getNumberOfPages();

        setPreviewPdfBlob(blob);
        setPreviewPages(total);
        setPreviewModalOpen(true);
    };

    return (
        <div>
            <button onClick={handleGenerarReporte} className="btn-primary">
                Generar / Previsualizar Reporte
            </button>

            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                title="Reporte de Operaciones"
                subtitle="Filtro: Mes actual | 25 registros"
                badge="CONTABILIDAD"
                pdfSource={previewPdfBlob}
                fileName="Reporte_Operaciones.pdf"
                totalPages={previewPages}
                footerInfo="Formato oficial SIPE Admin - Tamaño Carta"
            />
        </div>
    );
}
```

---

### 3. Exportación a Excel y PDF Rápido

Para consultas tabulares simples que ofrecen exportación rápida:

```javascript
import * as XLSX from 'xlsx';
import { useToast } from '../components/Toast';

const { addToast } = useToast();

const exportToExcel = (data, title) => {
    if (!data || data.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");
    XLSX.writeFile(workbook, `${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    addToast('Archivo Excel descargado con éxito', 'success');
};
```

---

### 4. Modales de Creación y Edición de Registros

Para modales de creación o edición de entidades (no de visualización de PDF), **SIEMPRE** usar el componente compartido `Modal` de `src/components/Modal.jsx` con los tamaños predefinidos (`size="sm|md|lg|xl"`). Nunca crear divs con `position: fixed` y anchos fijos en píxeles.

#### Reglas para Formularios:
- **Responsive Form Grid**: Utilizar clases `.form-grid` junto con `.form-grid-2` o `.form-grid-3` y `.span-2`/`.span-3`. Esto colapsa automáticamente a 1 columna en móviles (`≤768px`).
- **Mayúsculas Automáticas**: Los campos de "Documento", "Referencia", "Concepto" o "Descripción" deben transformar a MAYÚSCULAS con `style={{ textTransform: 'uppercase' }}` y al actualizar el estado con `.toUpperCase()`.
- **Acciones Destructivas**: Envolver eliminaciones con `useConfirm` (`variant: 'danger'`) y notificar con `useToast`.

```jsx
import Modal from '../components/Modal';

<Modal
    isOpen={showModal}
    onClose={() => setShowModal(false)}
    title={editingItem ? 'Editar Registro' : 'Nuevo Registro'}
    size="md"
>
    <form onSubmit={handleSubmit} className="form-grid form-grid-2">
        <div className="span-2">
            <label>Descripción *</label>
            <input
                className="form-control"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value.toUpperCase() })}
                style={{ textTransform: 'uppercase' }}
                required
            />
        </div>
        <div>
            <label>Monto *</label>
            <input type="number" step="0.01" className="form-control" ... />
        </div>
        <div className="span-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
        </div>
    </form>
</Modal>
```
