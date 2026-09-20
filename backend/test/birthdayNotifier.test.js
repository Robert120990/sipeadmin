const { describe, it } = require('node:test');
const assert = require('node:assert');
const { formatSpanishDate, buildBirthdayEmailHtml } = require('../services/birthdayNotifier');

describe('Birthday Notifier Service Tests', () => {
    it('formatSpanishDate should return properly formatted Spanish date string', () => {
        const testDate = new Date('2026-09-20T12:00:00Z');
        const formatted = formatSpanishDate(testDate);

        assert.ok(typeof formatted === 'string');
        assert.ok(formatted.includes('20'));
        assert.ok(formatted.includes('septiembre'));
        assert.ok(formatted.includes('2026'));
    });

    it('buildBirthdayEmailHtml should render HTML table with employee data', () => {
        const sampleBirthdays = [
            {
                nombre: 'CARLOS ALBERTO PEREZ',
                fecha_nacimiento: '15/09/1990',
                edad_cumplida: 36,
                empresa: 'ESTACION CENTRAL S.A.',
                departamento: 'OPERACIONES'
            },
            {
                nombre: 'MARIA ELENA GOMEZ',
                fecha_nacimiento: '15/09/1995',
                edad_cumplida: 31,
                empresa: 'ANDELSA S.A.',
                departamento: 'ADMINISTRACION'
            }
        ];

        const html = buildBirthdayEmailHtml(sampleBirthdays, 'Martes, 15 de septiembre de 2026');

        assert.ok(typeof html === 'string');
        assert.ok(html.includes('Cumpleañeros del Día'));
        assert.ok(html.includes('CARLOS ALBERTO PEREZ'));
        assert.ok(html.includes('MARIA ELENA GOMEZ'));
        assert.ok(html.includes('ESTACION CENTRAL S.A.'));
        assert.ok(html.includes('36 años'));
        assert.ok(html.includes('31 años'));
    });
});
