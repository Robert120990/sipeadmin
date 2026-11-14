process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..');

function collectJsFiles(dir, result = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'test' || entry.name === 'backups' || entry.name === 'logs' || entry.name === 'data') {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(full, result);
        } else if (entry.name.endsWith('.js')) {
            result.push(full);
        }
    }
    return result;
}

describe('Integridad Arquitectónica: Cero Ciclos CJS y Contratos de Módulos (Fase 3)', () => {
    it('no debe existir ningún ciclo de importación CommonJS en backend/', () => {
        const files = collectJsFiles(BACKEND_ROOT);
        const fileSet = new Set(files.map(f => path.normalize(f)));
        const adj = new Map();

        const requireRegex = /\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g;

        for (const file of files) {
            const normFile = path.normalize(file);
            const content = fs.readFileSync(normFile, 'utf8');
            const deps = new Set();
            let match;
            while ((match = requireRegex.exec(content)) !== null) {
                const rel = match[1];
                const baseResolved = path.resolve(path.dirname(normFile), rel);
                const candidates = [
                    baseResolved,
                    `${baseResolved}.js`,
                    path.join(baseResolved, 'index.js')
                ].map(c => path.normalize(c));
                const target = candidates.find(c => fileSet.has(c));
                if (target) deps.add(target);
            }
            adj.set(normFile, [...deps]);
        }

        const state = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
        const stack = [];
        const cycles = [];

        function dfs(node) {
            state.set(node, 1);
            stack.push(node);
            for (const next of (adj.get(node) || [])) {
                const st = state.get(next) || 0;
                if (st === 0) {
                    dfs(next);
                } else if (st === 1) {
                    const idx = stack.indexOf(next);
                    const cyclePath = [...stack.slice(idx), next]
                        .map(p => path.relative(BACKEND_ROOT, p).replace(/\\/g, '/'));
                    cycles.push(cyclePath.join(' -> '));
                }
            }
            stack.pop();
            state.set(node, 2);
        }

        for (const f of fileSet) {
            if (!state.get(f)) dfs(f);
        }

        assert.deepStrictEqual(
            cycles,
            [],
            `Se detectaron ciclos de importación CJS inesperados:\n${cycles.join('\n')}`
        );
    });

    it('routes/consultas.js debe preservar las 31 rutas HTTP y sus 13 helpers públicos tras modularización', () => {
        const consultasRouter = require('../routes/consultas');
        const routeSignatures = consultasRouter.stack
            .filter(layer => layer.route)
            .map(layer => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);

        assert.strictEqual(routeSignatures.length, 31);
        assert.ok(routeSignatures.includes('GET /ventas/consolidado/:date'));
        assert.ok(routeSignatures.includes('GET /ventas/resumen-mensual/:periodo'));
        assert.ok(routeSignatures.includes('GET /ventas/resumen-rango/:start/:end'));
        assert.ok(routeSignatures.includes('GET /ventas/comparativo-anual'));
        assert.ok(routeSignatures.includes('GET /ventas/cierre-turno/detalle/:id_empresa/:date/:rubro'));
        assert.ok(routeSignatures.includes('POST /ventas/cierre-turno/analisis-ia'));
        assert.ok(routeSignatures.includes('GET /consultas/estaciones/precios-competencia'));
        assert.ok(routeSignatures.includes('POST /consultas/estaciones/precios-competencia/sync-dgehm'));
        assert.ok(routeSignatures.includes('GET /consultas/estaciones/precios-competencia/bi-analytics'));

        const expectedHelpers = [
            'normalizeStationName',
            'getResumenMensualData',
            'getResumenRangoVentasData',
            'getComparativoAnualData',
            'getCleanStationName',
            'getCleanTiendaName',
            'getCortesTiendaData',
            'isGenericDescription',
            'generarAnalisisDescuadre',
            'getTurnosPorEmpresa',
            'mapCierreRowConExplicacion',
            'getConsolidadoVentasData',
            'getPreciosEstacionData'
        ];
        for (const helper of expectedHelpers) {
            assert.strictEqual(typeof consultasRouter[helper], 'function', `Falta helper público consultas.${helper}`);
        }
    });

    it('services/telegramBotService.js debe preservar sus 99 exportaciones y compartir estado con submódulos', async () => {
        const botService = require('../services/telegramBotService');
        const transportService = require('../services/telegramTransportService');
        const dataService = require('../services/telegramDataService');
        const geminiService = require('../services/telegramGeminiService');
        const formattersService = require('../services/telegramFormatters');
        const pdfService = require('../services/telegramPdfService');

        assert.strictEqual(Object.keys(botService).length, 99);
        assert.strictEqual(botService.sendTelegramMessage, transportService.sendTelegramMessage);
        assert.strictEqual(botService.getBotStatus, transportService.getBotStatus);
        assert.strictEqual(botService.queryMemoryCache, dataService.queryMemoryCache);
        assert.strictEqual(botService.getPreciosCompetenciaData, dataService.getPreciosCompetenciaData);
        assert.strictEqual(botService.getGeminiApiKey, geminiService.getGeminiApiKey);
        assert.strictEqual(botService.formatVentasMessage, formattersService.formatVentasMessage);
        assert.strictEqual(botService.generateExecutiveReportPdf, pdfService.generateExecutiveReportPdf);

        // Verificar que stopTelegramBot actualiza runtimeState compartido
        transportService.runtimeState.isPollingActive = true;
        botService.stopTelegramBot();
        assert.strictEqual(transportService.runtimeState.isPollingActive, false);
    });
});
