const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * Task helper logic tested in isolation
 */
function calculateTaskStatusMetrics(tasks) {
    const today = new Date().toISOString().split('T')[0];
    const total = tasks.length;
    let pendientes = 0;
    let en_proceso = 0;
    let en_revision = 0;
    let completadas = 0;
    let vencidas = 0;
    let vence_hoy = 0;

    for (const t of tasks) {
        if (t.estado === 'pendiente') pendientes++;
        else if (t.estado === 'en_proceso') en_proceso++;
        else if (t.estado === 'en_revision') en_revision++;
        else if (t.estado === 'completada') completadas++;

        if (t.estado !== 'completada' && t.estado !== 'cancelada') {
            if (t.fecha_vencimiento < today) vencidas++;
            else if (t.fecha_vencimiento === today) vence_hoy++;
        }
    }

    return { total, pendientes, en_proceso, en_revision, completadas, vencidas, vence_hoy };
}

function calculateChecklistProgress(checklist = []) {
    if (!Array.isArray(checklist) || checklist.length === 0) {
        return { total: 0, completed: 0, percentage: 0 };
    }
    const completed = checklist.filter(item => Boolean(item.completado)).length;
    const percentage = Math.round((completed / checklist.length) * 100);
    return { total: checklist.length, completed, percentage };
}

function getDeadlineInfo(task) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [y, m, d] = task.fecha_vencimiento.split('-').map(Number);
    const dueDate = new Date(y, m - 1, d);
    dueDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (task.estado === 'completada') {
        return { status: 'completada', label: 'Completada', color: 'success' };
    }
    if (diffDays < 0) {
        return { status: 'vencida', label: `Vencida (${Math.abs(diffDays)}d)`, color: 'danger' };
    }
    if (diffDays === 0) {
        return { status: 'hoy', label: 'Vence hoy', color: 'warning' };
    }
    return { status: 'en_plazo', label: `${diffDays} día(s) restante(s)`, color: 'info' };
}

describe('Tasks Management Unit Tests', () => {
    it('calculateTaskStatusMetrics should calculate correct counts and overdue items', () => {
        const sampleTasks = [
            { estado: 'pendiente', fecha_vencimiento: '2020-01-01' }, // vencida
            { estado: 'en_proceso', fecha_vencimiento: '2030-12-31' }, // en plazo
            { estado: 'en_revision', fecha_vencimiento: '2030-12-31' },
            { estado: 'completada', fecha_vencimiento: '2020-01-01' } // completada (no cuenta como vencida)
        ];

        const metrics = calculateTaskStatusMetrics(sampleTasks);
        assert.strictEqual(metrics.total, 4);
        assert.strictEqual(metrics.pendientes, 1);
        assert.strictEqual(metrics.en_proceso, 1);
        assert.strictEqual(metrics.en_revision, 1);
        assert.strictEqual(metrics.completadas, 1);
        assert.strictEqual(metrics.vencidas, 1);
    });

    it('calculateChecklistProgress should calculate correct percentage', () => {
        const checklist = [
            { id: 1, texto: 'Paso 1', completado: true },
            { id: 2, texto: 'Paso 2', completado: false },
            { id: 3, texto: 'Paso 3', completado: true },
            { id: 4, texto: 'Paso 4', completado: false }
        ];

        const progress = calculateChecklistProgress(checklist);
        assert.strictEqual(progress.total, 4);
        assert.strictEqual(progress.completed, 2);
        assert.strictEqual(progress.percentage, 50);

        const emptyProgress = calculateChecklistProgress([]);
        assert.strictEqual(emptyProgress.percentage, 0);
    });

    it('getDeadlineInfo should detect overdue, today, and completed status correctly', () => {
        const overdueTask = { estado: 'pendiente', fecha_vencimiento: '2020-01-01' };
        const completedTask = { estado: 'completada', fecha_vencimiento: '2020-01-01' };
        const futureTask = { estado: 'en_proceso', fecha_vencimiento: '2035-05-10' };

        assert.strictEqual(getDeadlineInfo(overdueTask).status, 'vencida');
        assert.strictEqual(getDeadlineInfo(completedTask).status, 'completada');
        assert.strictEqual(getDeadlineInfo(futureTask).status, 'en_plazo');
    });
});
