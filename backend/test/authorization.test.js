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
});
