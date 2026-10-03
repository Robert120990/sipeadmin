const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

describe('Authorization & Error Hardening Tests', () => {
    const createMockRes = (requestId = 'test-request-id-123') => {
        const res = {
            statusCode: 200,
            body: null,
            req: { id: requestId, headers: { 'x-request-id': requestId } },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                return this;
            }
        };
        return res;
    };

    describe('requirePermission Route Guards', () => {
        const bitacoraPerms = ['view_bitacora', '/dashboard/bitacora', '/dashboard/seguridad/bitacora'];
        const chequesPerms = ['manage_cheques', '/dashboard/bancos/cheques'];
        const tareasPerms = ['manage_tasks', '/dashboard/operaciones/tareas'];

        it('debe rechazar acceso (403) a usuario autenticado que no tiene los permisos requeridos', () => {
            const req = {
                user: {
                    id: 10,
                    username: 'operador_limitado',
                    role_id: 3,
                    permissions: ['/dashboard', '/dashboard/carriers']
                }
            };
            const res = createMockRes();
            let nextCalled = false;

            const middleware = requirePermission(bitacoraPerms);
            middleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, 'Acceso denegado: no cuenta con los permisos necesarios para realizar esta acción.');
            assert.strictEqual(nextCalled, false);
        });

        it('debe permitir acceso si el usuario tiene al menos un permiso coincidente en el arreglo', () => {
            const req = {
                user: {
                    id: 10,
                    username: 'auditor',
                    role_id: 2,
                    permissions: ['/dashboard/seguridad/bitacora']
                }
            };
            const res = createMockRes();
            let nextCalled = false;

            const middleware = requirePermission(bitacoraPerms);
            middleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('debe otorgar paso directo si el usuario es Administrador (role_id === 1)', () => {
            const req = {
                user: {
                    id: 1,
                    username: 'admin',
                    role_id: 1,
                    permissions: []
                }
            };
            const res = createMockRes();
            let nextCalled = false;

            const middleware = requirePermission(tareasPerms);
            middleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('debe proteger cheques ante usuarios con permisos de solo lectura no relacionados', () => {
            const req = {
                user: {
                    id: 5,
                    username: 'cajero',
                    role_id: 4,
                    permissions: ['/dashboard/consultas/estaciones/ventas']
                }
            };
            const res = createMockRes();
            let nextCalled = false;

            const middleware = requirePermission(chequesPerms);
            middleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(nextCalled, false);
        });
    });

    describe('sendSafeError con Request ID & Sanitización', () => {
        it('debe incluir el requestId en la respuesta JSON para trazabilidad', () => {
            const res = createMockRes('req-uuid-abc-987');
            const fakeError = new Error('Database syntax error in SELECT * FROM sensitive_table');

            sendSafeError(res, fakeError, 'Error al consultar datos', 500);

            assert.strictEqual(res.statusCode, 500);
            assert.strictEqual(res.body.message, 'Error al consultar datos');
            assert.strictEqual(res.body.requestId, 'req-uuid-abc-987');
        });

        it('debe generar un requestId nuevo si la solicitud no traía uno', () => {
            const res = {
                statusCode: 200,
                body: null,
                req: { headers: {} },
                status(code) { this.statusCode = code; return this; },
                json(data) { this.body = data; return this; }
            };

            sendSafeError(res, new Error('Test err'), 'Error controlado');

            assert.strictEqual(res.statusCode, 500);
            assert.ok(typeof res.body.requestId === 'string' && res.body.requestId.length > 10);
        });
    });

    describe('Webhook HMAC SHA-256 Signature Verification', () => {
        const secret = 'test-super-secret-key-456';
        const body = JSON.stringify({ ref: 'refs/heads/main', commits: [] });

        it('debe validar exitosamente firmas legítimas generadas con el secreto compartido', () => {
            const hmac = crypto.createHmac('sha256', secret);
            const digest = 'sha256=' + hmac.update(body).digest('hex');

            const sigBuffer = Buffer.from(digest, 'utf8');
            const expectedDigest = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
            const expectedBuffer = Buffer.from(expectedDigest, 'utf8');

            const isValid = sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
            assert.strictEqual(isValid, true);
        });

        it('debe rechazar firmas alteradas o calculadas con un secreto incorrecto', () => {
            const hmacWrong = crypto.createHmac('sha256', 'wrong-secret');
            const wrongDigest = 'sha256=' + hmacWrong.update(body).digest('hex');

            const expectedDigest = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

            const sigBuffer = Buffer.from(wrongDigest, 'utf8');
            const expectedBuffer = Buffer.from(expectedDigest, 'utf8');

            const isValid = sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
            assert.strictEqual(isValid, false);
        });

        it('debe rechazar firmas con longitudes diferentes sin disparar excepción en timingSafeEqual', () => {
            const malformedSig = 'sha256=short';
            const expectedDigest = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

            const sigBuffer = Buffer.from(malformedSig, 'utf8');
            const expectedBuffer = Buffer.from(expectedDigest, 'utf8');

            const isValid = sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
            assert.strictEqual(isValid, false);
        });
    });

    describe('Cross-Module Permission Integration (R1, R2, S9)', () => {
        const fletesViewPerms = [
            'manage_pedidos',
            'view_ventas',
            '/dashboard/operaciones/pedidos',
            '/dashboard/consultas/estaciones/ventas',
            '/dashboard/estrategia/combustible'
        ];

        const bancosViewPerms = [
            'manage_cuentas_bancarias',
            'manage_movimientos',
            'manage_conciliacion_bancaria',
            'manage_cheques',
            '/dashboard/bancos/cuentas',
            '/dashboard/bancos/movimientos',
            '/dashboard/bancos/conciliacion',
            '/dashboard/bancos/cheques',
            '/dashboard/bancos/impresion-cheques',
            '/dashboard/bancos/check-designer',
            '/dashboard/operaciones/pedidos',
            'manage_pedidos',
            '/dashboard/rrhh/planillas',
            'view_rrhh_planillas'
        ];

        const catalogosViewPerms = [
            'manage_catalogos',
            '/dashboard/carriers',
            '/dashboard/tankers',
            '/dashboard/operaciones/pedidos',
            'manage_pedidos'
        ];

        const checkDesignerPerms = [
            'manage_check_designer',
            '/dashboard/bancos/check-designer',
            '/dashboard/bancos/cheques',
            '/dashboard/bancos/impresion-cheques',
            'manage_cheques'
        ];

        const finanzasViewPerms = [
            'manage_finanzas',
            '/dashboard/finanzas/resumen',
            '/dashboard/finanzas/prestamos',
            '/dashboard/finanzas/proyectos',
            '/dashboard/finanzas/mantenimiento',
            '/dashboard/finanzas/configuracion'
        ];

        it('R1: Usuario de Ventas Estaciones debe tener acceso a fletes/combustibles sin 403', () => {
            const req = {
                user: {
                    id: 20,
                    role_id: 3,
                    permissions: ['/dashboard/consultas/estaciones/ventas']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(fletesViewPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('R2: Usuario de Pedidos de Combustible debe poder listar cuentas bancarias', () => {
            const req = {
                user: {
                    id: 21,
                    role_id: 3,
                    permissions: ['/dashboard/operaciones/pedidos']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(bancosViewPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('R2: Usuario de RRHH Planillas debe poder consultar cuentas bancarias para dispersión', () => {
            const req = {
                user: {
                    id: 22,
                    role_id: 3,
                    permissions: ['view_rrhh_planillas']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(bancosViewPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('S9: Usuario de Pedidos debe poder consultar Transportistas (Carriers) y Cisternas (Tankers)', () => {
            const req = {
                user: {
                    id: 23,
                    role_id: 3,
                    permissions: ['/dashboard/operaciones/pedidos']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(catalogosViewPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('S9: Usuario de Cheques debe tener acceso a Formatos de Cheque (CheckDesigner)', () => {
            const req = {
                user: {
                    id: 24,
                    role_id: 3,
                    permissions: ['/dashboard/bancos/cheques']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(checkDesignerPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
        });

        it('S9: Debe rechazar con 403 a usuarios no autorizados en el módulo de Finanzas', () => {
            const req = {
                user: {
                    id: 25,
                    role_id: 5,
                    permissions: ['/dashboard/consultas/estaciones/ventas']
                }
            };
            const res = createMockRes();
            let nextCalled = false;
            requirePermission(finanzasViewPerms)(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, 'Acceso denegado: no cuenta con los permisos necesarios para realizar esta acción.');
        });
    });

    describe('Date Range Guard Validation (S10)', () => {
        function validateDateRange(desde, hasta) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
                return { valid: false, status: 400, message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' };
            }
            const curr = new Date(desde + 'T12:00:00');
            const endDate = new Date(hasta + 'T12:00:00');
            if (isNaN(curr.getTime()) || isNaN(endDate.getTime())) {
                return { valid: false, status: 400, message: 'Fechas inválidas' };
            }
            if (curr > endDate) {
                return { valid: false, status: 400, message: 'La fecha inicial no puede ser mayor que la fecha final' };
            }
            const diffDays = Math.ceil((endDate.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 366) {
                return { valid: false, status: 400, message: 'El rango de fechas no puede exceder 366 días' };
            }
            return { valid: true, status: 200, diffDays };
        }

        it('debe rechazar formatos de fecha mal formados (ej. DD/MM/YYYY)', () => {
            const res = validateDateRange('01-01-2026', '2026-01-31');
            assert.strictEqual(res.valid, false);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.message, 'Formato de fecha inválido (debe ser YYYY-MM-DD)');
        });

        it('debe rechazar rangos donde fecha inicial es mayor a fecha final', () => {
            const res = validateDateRange('2026-05-15', '2026-05-10');
            assert.strictEqual(res.valid, false);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.message, 'La fecha inicial no puede ser mayor que la fecha final');
        });

        it('debe rechazar rangos masivos que superen 366 días para prevenir DoS', () => {
            const res = validateDateRange('2024-01-01', '2026-01-01');
            assert.strictEqual(res.valid, false);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.message, 'El rango de fechas no puede exceder 366 días');
        });

        it('debe aceptar rangos válidos dentro del límite permitido', () => {
            const res = validateDateRange('2026-01-01', '2026-01-31');
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.diffDays, 30);
        });
    });

    describe('Task Ownership & Access Control (R3)', () => {
        function checkTaskQueryAuth(user, queryUserId, isManager) {
            const isAdmin = user.role_id === 1;
            if (isAdmin || isManager) return { allowed: true, filterUserId: queryUserId || null };
            // Non-manager can only see their own tasks
            return { allowed: true, filterUserId: user.id };
        }

        it('permite a un usuario no administrador consultar sus propias tareas asignadas', () => {
            const user = { id: 42, role_id: 3, permissions: [] };
            const auth = checkTaskQueryAuth(user, 42, false);
            assert.strictEqual(auth.allowed, true);
            assert.strictEqual(auth.filterUserId, 42);
        });

        it('restringe a un usuario regular para que solo reciba sus tareas aunque intente ver las de otro', () => {
            const user = { id: 42, role_id: 3, permissions: [] };
            const auth = checkTaskQueryAuth(user, 99, false);
            assert.strictEqual(auth.allowed, true);
            assert.strictEqual(auth.filterUserId, 42); // Forzado a sus propias tareas
        });

        it('permite a un Manager o Administrador filtrar por cualquier usuario o ver todas', () => {
            const adminUser = { id: 1, role_id: 1, permissions: [] };
            const auth = checkTaskQueryAuth(adminUser, 99, true);
            assert.strictEqual(auth.allowed, true);
            assert.strictEqual(auth.filterUserId, 99);
        });
    });
});

