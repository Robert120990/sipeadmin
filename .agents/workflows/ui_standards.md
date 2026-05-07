---
description: Estandar para crear nuevas consultas o tablas con exportacion a Excel y PDF
---

Cuando necesites crear una nueva vista de "Consulta", tabla de datos o sección de reporte en el frontend del SIPE Admin, DEBES utilizar este formato estándar para mantener la consistencia visual y funcional del proyecto.

### 1. Importaciones Requeridas
Para la exportación y los iconos estándar, importa:
```javascript
import { BarChart3, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
```

### 2. Lógica de Exportación
Incluye siempre estas funciones para exportar datos (asumiendo que tus datos están en un estado `data` y el nombre en `title`):
```javascript
const exportToExcel = () => {
    if (data.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    XLSX.writeFile(workbook, `${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    addToast('Archivo Excel descargado', 'success');
};

const exportToPDF = () => {
    if (data.length === 0) return;
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    // Asumiendo que columns es un arreglo de las llaves del objeto
    const tableColumn = columns.map(c => c.replace(/_/g, ' '));
    const tableRows = data.map(row => columns.map(c => row[c]));

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    addToast('Documento PDF descargado', 'success');
};
```

### 3. Layout y Botones de Exportar
La cabecera de la vista debe renderizarse de la siguiente manera, organizando el título y los botones de exportar responsivamente:
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
    <div>
        <h1>{title}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{description}</p>
    </div>
    
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} title="Exportar a formato Excel">
                <FileSpreadsheet size={18} /> Excel
            </button>
            <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} title="Exportar a formato PDF">
                <FileText size={18} /> PDF
            </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--border-radius)' }}>
            <BarChart3 size={20} />
            <span style={{ fontWeight: '500' }}>Registros encontrados: {data.length}</span>
        </div>
    </div>
</div>
```

### 4. Layout de la Tabla
La tabla debe ir envuelta en las clases estándar del proyecto (`card glass`) para conservar el aspecto visual:
```jsx
<div className="card glass" style={{ overflowX: 'auto' }}>
    <table style={{ minWidth: '100%', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
        {/* ... thead and tbody correspondientes ... */}
    </table>
</div>
```
### 5. Formularios y Modales de Edición e Ingreso
Para los modales de creación o edición de registros, utiliza este estándar para garantizar una experiencia de usuario premium y consistente.

#### Reglas de Oro de Diseño
- **Altura Consistente**: Todos los campos (inputs, selects, áreas de texto y campos de solo lectura) DEBEN tener la misma altura estándar de **42px**. Esto garantiza la simetría visual en grids y filas.
- **Mayúsculas Automáticas**: Los campos de tipo "Documento", "Referencia", "Concepto" o "Descripción" deben configurarse para transformar el texto a MAYÚSCULAS automáticamente tanto visualmente (`text-transform: uppercase`) como en el estado del componente (`.toUpperCase()`).

#### Estructura del Modal
Utiliza un fondo oscuro con `backdropFilter` y una tarjeta con estilo `glass`:
```jsx
<div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
    <div className="card glass shadow-xl" style={{ width: '650px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', alignItems: 'center' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                {editingItem ? <Edit2 size={24} color="var(--primary)" /> : <Plus size={24} color="var(--primary)" />}
                {editingItem ? 'Editar Registro' : 'Nuevo Registro'}
            </h2>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={24} /></button>
        </div>
        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Contenido del Formulario */}
        </form>
    </div>
</div>
```

#### Estilo de Inputs y Selectores
- **Labels**: Deben usar `fontSize: '0.875rem'` y `color: 'var(--text-muted)'`.
- **Selectores**: Deben heredar el estilo global del proyecto y mantener la altura de 42px.
- **Campos de Solo Lectura**: Usa un div con fondo levemente translúcido y borde, con altura fija de 42px:
  ```jsx
  <div style={{ padding: '0 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', fontSize: '0.9rem', height: '42px', display: 'flex', alignItems: 'center' }}>
      {valor}
  </div>
  ```

#### Botones de Acción
Coloca los botones al final del formulario con un ratio de tamaño de 1:2 (Cancelar:Confirmar):
```jsx
<div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
    <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
    <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
        <Save size={18} />
        {editingItem ? 'Actualizar' : 'Guardar'}
    </button>
</div>
```
