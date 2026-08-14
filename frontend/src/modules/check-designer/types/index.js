// Definiciones de tipos para el módulo de diseñador de cheques

/**
 * @typedef {Object} FormatoCampo
 * @property {string} id - ID único del campo (ej. uuid).
 * @property {string} tipo - Tipo de campo (ej. 'fecha', 'beneficiario').
 * @property {string} variable - Nombre de la variable del sistema.
 * @property {string} etiqueta - Texto a mostrar en el lienzo.
 * @property {number} x - Posición X en píxeles.
 * @property {number} y - Posición Y en píxeles.
 * @property {number} ancho - Ancho del campo en píxeles.
 * @property {number} alto - Alto del campo en píxeles.
 * @property {number} [rotacion=0] - Ángulo de rotación en grados.
 * @property {'normal'|'bold'} [peso='normal'] - Peso de la fuente.
 * @property {'normal'|'italic'} [estilo='normal'] - Estilo de la fuente.
 * @property {string} [fontSize='12px'] - Tamaño de la fuente.
 * @property {string} [color='#000000'] - Color del texto.
 * @property {'izquierda'|'centro'|'derecha'} [alineacion='izquierda'] - Alineación del texto.
 * @property {boolean} [subrayado=false] - Si el texto está subrayado.
 * @property {string} [formatoFecha='DD/MM/YYYY'] - Formato de fecha.
 * @property {string} [formatoMonetario='#.00'] - Formato monetario.
 * @property {boolean} [visible=true] - Visibilidad del campo.
 */

/**
 * @typedef {Object} FormatoDiseno
 * @property {FormatoCampo[]} campos - Lista de campos en el diseño.
 * @property {Object} metadatos - Información adicional del diseño.
 */

/**
 * @typedef {Object} FormatoCheque
 * @property {number} id - ID de la base de datos.
 * @property {string} name - Nombre del formato.
 * @property {number|null} banco_id - ID del banco asociado.
 * @property {string} [banco_nombre] - Nombre del banco (obtenido de un JOIN).
 * @property {string} [description] - Descripción del formato.
 * @property {number} width - Ancho en mm.
 * @property {number} height - Alto en mm.
 * @property {'vertical'|'horizontal'} orientation - Orientación.
 * @property {number} margin_top - Margen superior en mm.
 * @property {number} margin_right - Margen derecho en mm.
 * @property {number} margin_bottom - Margen inferior en mm.
 * @property {number} margin_left - Margen izquierdo en mm.
 * @property {number} resolution - Resolución en DPI.
 * @property {string|null} printer_name - Impresora predeterminada.
 * @property {boolean} is_active - Estado activo/inactivo.
 * @property {FormatoDiseno} design_json - El diseño JSON del lienzo.
 * @property {string} created_at - Fecha de creación.
 * @property {string} updated_at - Fecha de actualización.
 */

// Exportar tipos para uso en otros archivos (si se usara TypeScript, serian import types)
export const TIPOS_CAMPO = {
    FECHA: 'fecha',
    DIA: 'dia',
    MES: 'mes',
    ANIO: 'anio',
    BENEFICIARIO: 'beneficiario',
    MONTO_NUMEROS: 'monto_numeros',
    MONTO_LETRAS: 'monto_letras',
    CONCEPTO: 'concepto',
    NUMERO_CHEQUE: 'numero_cheque',
    CIUDAD: 'ciudad',
    EMPRESA: 'empresa',
    CUENTA_BANCARIA: 'cuenta_bancaria',
    USUARIO_IMPRESION: 'usuario_impresion',
    SUCURSAL: 'sucursal',
    OBSERVACIONES: 'observaciones',
    TEXTO_FIJO: 'texto_fijo',
    FECHA_LETRAS: 'fecha_letras',
};

export const VARIABLES_DISPONIBLES = [
    { tipo: TIPOS_CAMPO.FECHA, etiqueta: 'Fecha', icon: 'calendar_today' },
    { tipo: TIPOS_CAMPO.DIA, etiqueta: 'Día' },
    { tipo: TIPOS_CAMPO.MES, etiqueta: 'Mes' },
    { tipo: TIPOS_CAMPO.ANIO, etiqueta: 'Año' },
    { tipo: TIPOS_CAMPO.FECHA_LETRAS, etiqueta: 'Fecha en Letras', icon: 'calendar_check' },
    { tipo: TIPOS_CAMPO.BENEFICIARIO, etiqueta: 'Beneficiario', icon: 'person' },
    { tipo: TIPOS_CAMPO.MONTO_NUMEROS, etiqueta: 'Monto en Números', icon: 'numbers' },
    { tipo: TIPOS_CAMPO.MONTO_LETRAS, etiqueta: 'Monto en Letras', icon: 'short_text' },
    { tipo: TIPOS_CAMPO.CONCEPTO, etiqueta: 'Concepto', icon: 'subject' },
    { tipo: TIPOS_CAMPO.NUMERO_CHEQUE, etiqueta: 'Número de Cheque', icon: 'tag' },
    { tipo: TIPOS_CAMPO.CIUDAD, etiqueta: 'Ciudad', icon: 'location_city' },
    { tipo: TIPOS_CAMPO.EMPRESA, etiqueta: 'Empresa', icon: 'business' },
    { tipo: TIPOS_CAMPO.CUENTA_BANCARIA, etiqueta: 'Cuenta Bancaria', icon: 'account_balance' },
    { tipo: TIPOS_CAMPO.USUARIO_IMPRESION, etiqueta: 'Usuario que Imprime', icon: 'person_outline' },
    { tipo: TIPOS_CAMPO.SUCURSAL, etiqueta: 'Sucursal', icon: 'store' },
    { tipo: TIPOS_CAMPO.OBSERVACIONES, etiqueta: 'Observaciones', icon: 'chat' },
    { tipo: TIPOS_CAMPO.TEXTO_FIJO, etiqueta: 'NO NEGOCIABLE', icon: 'stamp' },
    { tipo: TIPOS_CAMPO.TEXTO_FIJO, etiqueta: 'SAN SALVADOR', icon: 'stamp' },
];
