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
