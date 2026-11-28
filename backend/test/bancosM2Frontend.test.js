const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_PAGES_DIR = path.resolve(__dirname, '../../frontend/src/pages');
const FRONTEND_UTILS_DIR = path.resolve(__dirname, '../../frontend/src/utils');
const PRINT_ENGINE_PATH = path.resolve(__dirname, '../../frontend/src/modules/check-designer/services/PrintEngine.js');

function createBrowserMock() {
    const store = new Map();
    const listeners = new Map();

    const localStorage = {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, val) {
            store.set(key, String(val));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };

    class MockCustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }

    const windowMock = {
        localStorage,
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        dispatchEvent(event) {
            const set = listeners.get(event?.type);
            if (!set) return true;
            for (const fn of [...set]) {
                fn(event);
            }
            return true;
        }
    };

    return { store, listeners, localStorage, MockCustomEvent, windowMock };
}

describe('M2 Frontend — bancosNavStorage.js (R5.4)', () => {
    let originalWindow;
    let originalCustomEvent;
    let mock;

    beforeEach(() => {
        originalWindow = global.window;
        originalCustomEvent = global.CustomEvent;
        mock = createBrowserMock();
        global.window = mock.windowMock;
        global.CustomEvent = mock.MockCustomEvent;
    });

    afterEach(() => {
        if (originalWindow === undefined) delete global.window;
        else global.window = originalWindow;

        if (originalCustomEvent === undefined) delete global.CustomEvent;
        else global.CustomEvent = originalCustomEvent;
    });

    it('saveBancosSelection y loadBancosSelection normalizan alias y limpian cuando está vacío', async () => {
        const { saveBancosSelection, loadBancosSelection } = await import('../../frontend/src/utils/bancosNavStorage.js');

        const saved = saveBancosSelection({ id_empresa: 12, corr: 45, numero_cuenta: '001-9988' });
        assert.equal(saved.empresaId, '12');
        assert.equal(saved.cuentaId, '45');
        assert.equal(saved.numeroCuenta, '001-9988');
        assert.equal(typeof saved.updatedAt, 'number');

        const loaded = loadBancosSelection();
        assert.deepEqual(loaded, {
            empresaId: '12',
            cuentaId: '45',
            numeroCuenta: '001-9988'
        });

        const cleared = saveBancosSelection({});
        assert.equal(cleared, null);
        assert.equal(loadBancosSelection(), null);
    });

    it('setPendingBancosNav y consumePendingBancosNav resuelven claves cortas, consumen 1 sola vez y expiran tras 30s', async () => {
        const {
            BANCOS_NAV_TARGETS,
            resolveBancosTargetPath,
            setPendingBancosNav,
            consumePendingBancosNav
        } = await import('../../frontend/src/utils/bancosNavStorage.js');

        assert.equal(resolveBancosTargetPath('conciliacion'), BANCOS_NAV_TARGETS.conciliacion);
        assert.equal(resolveBancosTargetPath('/dashboard/bancos/cheques'), '/dashboard/bancos/cheques');

        setPendingBancosNav({
            targetPath: 'conciliacion',
            empresa_codigo: 'EMP1',
            cuenta_bancaria_id: 77,
            numero: '123456',
            action: 'open_conciliar'
        });

        // No consume si la ruta esperada es otra
        assert.equal(consumePendingBancosNav('movimientos'), null);

        // Consume exactamente una vez en la ruta esperada
        const consumed = consumePendingBancosNav('/dashboard/bancos/conciliacion');
        assert.ok(consumed);
        assert.equal(consumed.targetPath, '/dashboard/bancos/conciliacion');
        assert.equal(consumed.empresaId, 'EMP1');
        assert.equal(consumed.cuentaId, '77');
        assert.equal(consumed.numeroCuenta, '123456');
        assert.equal(consumed.action, 'open_conciliar');
        assert.equal(consumePendingBancosNav('conciliacion'), null);

        // Expiración TTL > 30s
        const rawExpired = {
            targetPath: '/dashboard/bancos/kardex',
            empresaId: '1',
            cuentaId: '2',
            numeroCuenta: '999',
            timestamp: Date.now() - 31000
        };
        mock.windowMock.localStorage.setItem('sipe_bancos_pending_nav_v1', JSON.stringify(rawExpired));
        assert.equal(consumePendingBancosNav('/dashboard/bancos/kardex'), null);
        assert.equal(mock.windowMock.localStorage.getItem('sipe_bancos_pending_nav_v1'), null);
    });

    it('navigateToBancosTarget + subscribeBancosNavTarget soportan keep-alive y limpieza', async () => {
        const {
            navigateToBancosTarget,
            subscribeBancosNavTarget,
            resolveInitialBancosContext,
            saveBancosSelection
        } = await import('../../frontend/src/utils/bancosNavStorage.js');

        const navigatedPaths = [];
        const mockNavigate = (p) => navigatedPaths.push(p);

        const received = [];
        const unsubscribe = subscribeBancosNavTarget('conciliacion', (detail) => {
            received.push(detail);
        });

        navigateToBancosTarget(
            mockNavigate,
            'conciliacion',
            { empresaId: '3', cuentaId: '88', numeroCuenta: '9001-22' },
            { action: 'focus' }
        );

        assert.deepEqual(navigatedPaths, ['/dashboard/bancos/conciliacion']);
        assert.equal(received.length, 1);
        assert.equal(received[0].cuentaId, '88');
        assert.equal(received[0].action, 'focus');

        // Al suscribir, consume pending nav para evitar doble aplicación
        assert.equal(mock.windowMock.localStorage.getItem('sipe_bancos_pending_nav_v1'), null);

        unsubscribe();
        navigateToBancosTarget(mockNavigate, 'conciliacion', { empresaId: '3', cuentaId: '89' });
        assert.equal(received.length, 1);

        // resolveInitialBancosContext prioriza pending nav sobre last selection
        saveBancosSelection({ empresaId: '1', cuentaId: '10', numeroCuenta: '111' });
        navigateToBancosTarget(null, 'movimientos', { empresaId: '2', cuentaId: '20', numeroCuenta: '222' });
        const resolved = resolveInitialBancosContext('movimientos');
        assert.equal(resolved.cuentaId, '20');
        // Siguiente carga sin pending nav usa last selection
        const fallback = resolveInitialBancosContext('movimientos');
        assert.equal(fallback.cuentaId, '20');
    });

    it('findMatchingCuenta aplica prioridad exacta y evita ambigüedad entre empresas', async () => {
        const { findMatchingCuenta } = await import('../../frontend/src/utils/bancosNavStorage.js');

        const cuentas = [
            { id: 1, empresa_codigo: 'EMP_A', id_empresa: 1, numero: '100-01' },
            { id: 2, empresa_codigo: 'EMP_B', id_empresa: 2, numero: '100-01' },
            { id: 3, corr: 30, empresa_codigo: 'EMP_A', id_empresa: 1, numero: '200-99' }
        ];

        // 1) Por cuentaId exacto
        assert.equal(findMatchingCuenta(cuentas, { cuentaId: '2' })?.id, 2);
        // 2) Por empresaId + numeroCuenta
        assert.equal(findMatchingCuenta(cuentas, { empresaId: 'EMP_B', numeroCuenta: '100-01' })?.id, 2);
        // 3) Por numeroCuenta único
        assert.equal(findMatchingCuenta(cuentas, { numeroCuenta: '200-99' })?.id, 3);
        // 4) Ambiguo entre empresas sin empresaId => null
        assert.equal(findMatchingCuenta(cuentas, { numeroCuenta: '100-01' }), null);
        // 5) Vacío => null
        assert.equal(findMatchingCuenta(cuentas, null), null);
        assert.equal(findMatchingCuenta([], { cuentaId: '1' }), null);
    });
});

describe('M2 Frontend — Contratos ConciliacionBancaria.jsx (M2C) y Regresión AGENTS.md', () => {
    it('ConciliacionBancaria.jsx implementa todos los contratos R3.3, R4.2, R5.3, R5.4, R5.6, R6.1 y R2.4', () => {
        const filePath = path.join(FRONTEND_PAGES_DIR, 'ConciliacionBancaria.jsx');
        const src = fs.readFileSync(filePath, 'utf8');

        // Endpoints requeridos
        const requiredEndpoints = [
            '/bancos/conciliacion/catalogos',
            '/bancos/conciliacion/data',
            '/bancos/conciliacion/aplicar',
            '/bancos/conciliacion/validar-saldo',
            '/bancos/conciliacion/parse-extracto',
            '/bancos/conciliacion/parse-extracto-pdf',
            '/bancos/conciliacion/crear-masivo-y-aplicar',
            '/bancos/conciliacion/crear-y-aplicar',
            '/bancos/conciliacion/reglas',
            '/bancos/conciliacion/reglas/probar',
            '/bancos/conciliacion/cruces',
            '/desconciliar'
        ];
        for (const ep of requiredEndpoints) {
            assert.ok(src.includes(ep), `Falta endpoint esperado en ConciliacionBancaria.jsx: ${ep}`);
        }

        // R4.2 PDF/Imagen Multimodal debe enviar JSON (NO FormData, NO pdf_base64/imagenes/archivo_base64) y leer transacciones
        assert.match(src, /data_url/);
        assert.match(src, /mime_type/);
        assert.match(src, /res\.data\.transacciones/);
        assert.doesNotMatch(src, /new\s+FormData\s*\(/);
        assert.doesNotMatch(src, /pdf_base64/);
        assert.doesNotMatch(src, /archivo_base64/);

        // R5.3 + R6.1 ReceiptViewerModal con props exactas (open + comprobantes) y sin <a href={sug.comprobante_url}>
        assert.match(src, /import\s+ReceiptViewerModal\s+from\s+['"]\.\.\/components\/ReceiptViewerModal['"]/);
        assert.match(src, /<ReceiptViewerModal[\s\S]*open=\{viewerOpen\}[\s\S]*comprobantes=\{viewerItems\}/);
        assert.doesNotMatch(src, /<a\s+href=\{sug\.comprobante_url\}/);

        // R3.3 Aging de cheques
        assert.match(src, /aging_resumen/);
        assert.match(src, /aging_cheques/);
        assert.match(src, /agingFilter/);
        assert.match(src, /dias_circulacion/);
        assert.match(src, /por_caducar/);
        assert.match(src, /caduco/);

        // R4.2 Reglas IA y Cruces agrupados + Socket + Idempotency
        assert.match(src, /can_manage_reglas/);
        assert.match(src, /conciliacion_reglas_updated/);
        assert.match(src, /sugerencias_cruces_agrupados/);
        assert.match(src, /cruces_activos/);
        assert.match(src, /cruce_id/);
        assert.match(src, /X-Idempotency-Key/);

        // R5.4 bancosNavStorage.js
        assert.match(src, /bancosNavStorage/);
        assert.match(src, /resolveInitialBancosContext/);
        assert.match(src, /subscribeBancosNavTarget/);
        assert.match(src, /saveBancosSelection/);
        assert.match(src, /findMatchingCuenta/);

        // R5.6 Flujo guiado en 3 bloques
        assert.match(src, /className="form-grid form-grid-3"/);
        assert.match(src, /Saldo Banco \(Extracto\)/);
        assert.match(src, /Partidas en Tránsito/);
        assert.match(src, /Diferencia \(\$0\.00\)/);

        // R2.4 & AGENTS.md
        assert.match(src, /<ReportPreviewModal/);
        assert.match(src, /format:\s*['"]letter['"]/);
        assert.match(src, /useConfirm/);
        assert.match(src, /useToast/);
        assert.match(src, /formatCuentaLabel/);
        assert.match(src, /sortCuentas/);
        assert.doesNotMatch(src, /window\.print\s*\(/);
        assert.doesNotMatch(src, /window\.confirm\s*\(/);
        assert.doesNotMatch(src, /gridTemplateColumns/);
        assert.doesNotMatch(src, /flex:\s*['"]2 1 300px['"]/);
        assert.doesNotMatch(src, /return\s*\(\s*<div[^>]*padding:\s*['"]2rem['"]/);
    });

    it('ConciliacionBancaria.jsx aplica regresiones M2C Iteración 2 (fila_origen 1-a-1, isRowClosed cruce_id, upload mixto y minWidth 0)', () => {
        const filePath = path.join(FRONTEND_PAGES_DIR, 'ConciliacionBancaria.jsx');
        const src = fs.readFileSync(filePath, 'utf8');

        // 1) handleApplySugerenciaCruce debe preservar rawBancoItems y consumir filas 1-a-1 por fila_origen
        const sugFnMatch = src.match(/const handleApplySugerenciaCruce = async[\s\S]*?fetchData\(\{ preserveSelection: true \}\);/);
        assert.ok(sugFnMatch, 'Debe existir handleApplySugerenciaCruce');
        const sugFn = sugFnMatch[0];
        assert.match(sugFn, /rawBancoItems\s*=\s*sug\.banco_items/);
        assert.match(sugFn, /!consumedRows\.has\(idx\)/);
        assert.match(sugFn, /t\.fila_origen\s*===\s*b\.fila_origen/);

        // 2) isRowClosed en MOVIMIENTOS debe evaluar cruce_id solo por fecha_aplicado_ymd
        assert.match(
            src,
            /const isRowClosed = Boolean\(\s*resumen\.periodo_cerrado_hasta\s*&&\s*\(row\.cruce_id\s*\?\s*\(row\.fecha_aplicado_ymd\s*&&\s*row\.fecha_aplicado_ymd\s*<=\s*resumen\.periodo_cerrado_hasta\)/
        );

        // 3) handleFileUpload advierte cuando se mezclan Excel/CSV con múltiples archivos
        assert.match(src, /if\s*\(files\.some\(isSheetFile\)\)\s*\{\s*if\s*\(files\.length\s*>\s*1\)/);
        assert.match(src, /Seleccione un único archivo Excel\/CSV, o bien PDF\/imágenes por separado\./);

        // 4) Toolbar flex container tiene minWidth: 0 para seguridad en 320px
        assert.match(src, /flex:\s*['"]1 1 240px['"],\s*minWidth:\s*0/);
    });

    it('Todas las pantallas M2 de Bancos cumplen estándares de AGENTS.md y calibración PrintEngine', () => {
        const m2Pages = [
            'Cheques.jsx',
            'ChequesContado.jsx',
            'CuentasBancarias.jsx',
            'Consultas.jsx',
            'MovimientosBancarios.jsx',
            'ReporteChequesFecha.jsx',
            'ReporteMovimientosFecha.jsx',
            'ConciliacionBancaria.jsx'
        ];

        for (const page of m2Pages) {
            const src = fs.readFileSync(path.join(FRONTEND_PAGES_DIR, page), 'utf8');
            assert.doesNotMatch(src, /window\.print\s*\(/, `${page} no debe usar window.print()`);
            assert.doesNotMatch(src, /window\.confirm\s*\(/, `${page} no debe usar window.confirm()`);
            assert.doesNotMatch(src, /gridTemplateColumns/, `${page} no debe usar gridTemplateColumns inline`);
            assert.doesNotMatch(src, /return\s*\(\s*<div[^>]*padding:\s*['"]2rem['"]/, `${page} no debe usar padding: '2rem' en contenedor raíz`);
        }

        const previewPages = ['Cheques.jsx', 'Consultas.jsx', 'ReporteChequesFecha.jsx', 'ReporteMovimientosFecha.jsx', 'ConciliacionBancaria.jsx'];
        for (const page of previewPages) {
            const src = fs.readFileSync(path.join(FRONTEND_PAGES_DIR, page), 'utf8');
            assert.match(src, /<ReportPreviewModal/, `${page} debe usar ReportPreviewModal`);
        }

        const cuentaSelectorPages = ['Cheques.jsx', 'ChequesContado.jsx', 'CuentasBancarias.jsx', 'MovimientosBancarios.jsx', 'ReporteChequesFecha.jsx', 'ReporteMovimientosFecha.jsx', 'ConciliacionBancaria.jsx'];
        for (const page of cuentaSelectorPages) {
            const src = fs.readFileSync(path.join(FRONTEND_PAGES_DIR, page), 'utf8');
            assert.match(src, /formatCuentaLabel/, `${page} debe usar formatCuentaLabel`);
            assert.match(src, /sortCuentas/, `${page} debe usar sortCuentas`);
        }

        const navPages = ['Cheques.jsx', 'CuentasBancarias.jsx', 'Consultas.jsx', 'MovimientosBancarios.jsx', 'ReporteChequesFecha.jsx', 'ReporteMovimientosFecha.jsx', 'ConciliacionBancaria.jsx'];
        for (const page of navPages) {
            const src = fs.readFileSync(path.join(FRONTEND_PAGES_DIR, page), 'utf8');
            assert.match(src, /bancosNavStorage/, `${page} debe integrar bancosNavStorage`);
        }

        const printEngineSrc = fs.readFileSync(PRINT_ENGINE_PATH, 'utf8');
        assert.match(printEngineSrc, /translate\([^)]+\)\s+scale\(/, 'PrintEngine.js debe aplicar translate() antes de scale()');
        assert.ok(fs.existsSync(path.join(FRONTEND_UTILS_DIR, 'bancosNavStorage.js')));
    });
});
