const UNIDADES = ['', 'UNO ', 'DOS ', 'TRES ', 'CUATRO ', 'CINCO ', 'SEIS ', 'SIETE ', 'OCHO ', 'NUEVE ', 'DIEZ ', 'ONCE ', 'DOCE ', 'TRECE ', 'CATORCE ', 'QUINCE ', 'DIECISÉIS ', 'DIECISIETE ', 'DIECIOCHO ', 'DIECINUEVE ', 'VEINTE '];
const DECENAS = ['', 'DIEZ ', 'VEINTI', 'TREINTA ', 'CUARENTA ', 'CINCUENTA ', 'SESENTA ', 'SETENTA ', 'OCHENTA ', 'NOVENTA '];
const CENTENAS = ['', 'CIENTO ', 'DOSCIENTOS ', 'TRESCIENTOS ', 'CUATROCIENTOS ', 'QUINIENTOS ', 'SEISCIENTOS ', 'SETECIENTOS ', 'OCHOCIENTOS ', 'NOVECIENTOS '];

const toWords = (n) => {
    if (n === 0) return 'CERO ';
    let num = n;
    let words = '';

    if (num >= 1000000) {
        const millones = Math.floor(num / 1000000);
        words += (millones === 1 ? 'UN MILLÓN ' : toWords(millones) + 'MILLONES ');
        num %= 1000000;
    }
    if (num >= 1000) {
        const miles = Math.floor(num / 1000);
        words += (miles === 1 ? 'MIL ' : toWords(miles) + 'MIL ');
        num %= 1000;
    }
    if (num >= 100) {
        const centena = Math.floor(num / 100);
        words += (centena === 1 && num % 100 !== 0) ? 'CIENTO ' : CENTENAS[centena];
        num %= 100;
    }
    if (num >= 30) {
        const decena = Math.floor(num / 10);
        words += DECENAS[decena];
        num %= 10;
        if (num > 0) words += 'Y ';
    } else if (num >= 20) {
        words += 'VEINTI';
        num %= 10;
    } else if (num >= 10) {
        words += UNIDADES[num];
        num = 0;
    }
    if (num > 0) words += UNIDADES[num];

    return words;
};

/**
 * Convierte un número a su representación en letras (español, mayúsculas).
 * Ej: 1234.56 -> "MIL DOSCIENTOS TREINTA Y CUATRO CON 56/100"
 */
export const numeroALetras = (monto) => {
    const valor = parseFloat(monto);
    if (isNaN(valor)) return '';

    const entero = Math.floor(Math.abs(valor));
    const decimales = Math.round((Math.abs(valor) - entero) * 100);

    const parteEntera = toWords(entero);
    const parteDecimal = decimales > 0 ? `${String(decimales).padStart(2, '0')}/100` : '00/100';

    return `${parteEntera}CON ${parteDecimal}`.trim();
};

export const formatMonto = (monto) => {
    const valor = parseFloat(monto || 0);
    if (isNaN(valor)) return '0.00';
    return valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * Convierte una fecha en formato DD/MM/YYYY a su representación en letras (mayúsculas).
 * Ej: "14/08/2026" -> "14 DE AGOSTO DE 2026"
 */
export const formatearFechaEnLetras = (fecha) => {
    const partes = (fecha || '').split('/');
    if (partes.length !== 3) return fecha || '';
    const mes = parseInt(partes[1], 10);
    return `${parseInt(partes[0], 10)} DE ${MESES[mes - 1] || partes[1]} DE ${partes[2]}`;
};

/**
 * Convierte una fecha en formato DD/MM/YYYY a día y mes en letras (mayúsculas), sin año.
 * Ej: "14/08/2026" -> "14 DE AGOSTO"
 */
export const formatearFechaEnLetrasCorta = (fecha) => {
    const partes = (fecha || '').split('/');
    if (partes.length !== 3) return fecha || '';
    const mes = parseInt(partes[1], 10);
    return `${parseInt(partes[0], 10)} DE ${MESES[mes - 1] || partes[1]}`;
};