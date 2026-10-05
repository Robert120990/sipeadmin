const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { sanitizeData } = require('../middleware/bitacora');

describe('Auth Middleware & Security Tests', () => {
    // Helper to mock express res object
    const createMockRes = () => {
        const res = {
            statusCode: 200,
            body: null,
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

    describe('authenticateToken', () => {
        it('should return 401 when Authorization header is missing', () => {
            const req = { headers: {} };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.message, 'Token de acceso requerido');
            assert.strictEqual(nextCalled, false);
        });

        it('should return 401 when token is invalid or expired', () => {
            const req = { headers: { authorization: 'Bearer invalid.token.here' } };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.message, 'Token inválido o expirado');
            assert.strictEqual(nextCalled, false);
        });

        it('should attach decoded user and call next() on valid token', () => {
            const payload = { id: 42, username: 'testuser', role_id: 2, permissions: ['/dashboard/users'] };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.user.id, 42);
            assert.strictEqual(req.user.username, 'testuser');
        });

        it('should return 403 when user is marked inactive in token', () => {
            const payload = { id: 99, username: 'inactiveuser', status: 'inactive' };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, 'Usuario inactivo o suspendido');
            assert.strictEqual(nextCalled, false);
        });

        it('should return 403 when user ID has been revoked in real-time', () => {
            const payload = { id: 105, username: 'revokeduser', status: 'active' };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

            revokeUser(105);

            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, 'Usuario inactivo o suspendido');
            assert.strictEqual(nextCalled, false);

            // Clean up by restoring
            restoreUser(105);
        });
    });

    describe('requirePermission (BFLA Enforcement)', () => {
        it('should return 401 if req.user is not set', () => {
            const req = {};
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(nextCalled, false);
        });

        it('should allow Administrator (role_id === 1) regardless of explicit permission list', () => {
            const req = { user: { id: 1, username: 'admin', role_id: 1, permissions: [] } };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should allow Super Admin (role: "Super Admin", role_id > 1) regardless of explicit permission list', () => {
            const req = { user: { id: 2, username: 'superadmin', role: 'Super Admin', role_id: 2, permissions: [] } };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should allow Administrador (Spanish role name) regardless of explicit permission list', () => {
            const req = { user: { id: 3, username: 'admin_es', role: 'Administrador', role_id: 3, permissions: [] } };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should allow user with required permission', () => {
            const req = { 
                user: { 
                    id: 5, 
                    username: 'operator', 
                    role_id: 2, 
                    permissions: ['/dashboard/users', '/dashboard/consultas'] 
                } 
            };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should allow user matching any permission in an array (e.g. manage_users fallback)', () => {
            const req = { 
                user: { 
                    id: 6, 
                    username: 'user_manager', 
                    role_id: 4, 
                    permissions: ['manage_users'] 
                } 
            };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission(['/dashboard/users', 'manage_users'])(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should deny 403 when user lacks required permission', () => {
            const req = { 
                user: { 
                    id: 5, 
                    username: 'operator', 
                    role_id: 2, 
                    permissions: ['/dashboard/consultas'] 
                } 
            };
            const res = createMockRes();
            let nextCalled = false;

            requirePermission('/dashboard/users')(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(nextCalled, false);
            assert.match(res.body.message, /Acceso denegado/);
        });
    });

    describe('requireRole', () => {
        it('should allow user with allowed role string', () => {
            const req = { user: { role: 'Administrator', role_id: 1 } };
            const res = createMockRes();
            let nextCalled = false;

            requireRole('Administrator')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should allow Super Admin in requireRole("Administrator")', () => {
            const req = { user: { role: 'Super Admin', role_id: 2 } };
            const res = createMockRes();
            let nextCalled = false;

            requireRole('Administrator')(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
        });

        it('should deny 403 when user role is not permitted', () => {
            const req = { user: { role: 'User', role_id: 2 } };
            const res = createMockRes();
            let nextCalled = false;

            requireRole('Administrator')(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(nextCalled, false);
        });
    });

    describe('isAdminUser helper', () => {
        it('should return true for role_id 1 (number or string)', () => {
            assert.strictEqual(isAdminUser({ role_id: 1 }), true);
            assert.strictEqual(isAdminUser({ role_id: '1' }), true);
        });

        it('should return true for Super Admin, Administrador, Admin, etc.', () => {
            assert.strictEqual(isAdminUser({ role: 'Super Admin' }), true);
            assert.strictEqual(isAdminUser({ role: 'superadmin' }), true);
            assert.strictEqual(isAdminUser({ role_name: 'Super Administrador' }), true);
            assert.strictEqual(isAdminUser({ role: 'Administrador' }), true);
            assert.strictEqual(isAdminUser({ role: 'Administrator' }), true);
        });

        it('should return false for regular roles or empty user', () => {
            assert.strictEqual(isAdminUser(null), false);
            assert.strictEqual(isAdminUser({ role: 'Operador', role_id: 3 }), false);
            assert.strictEqual(isAdminUser({ role: 'Auditor', role_id: 4 }), false);
        });
    });

    describe('sendSafeError utility', () => {
        it('should return safe message and not expose internal SQL error trace', () => {
            const res = createMockRes();
            const sqlError = new Error('SELECT * FROM secret_table WHERE id = syntax error near xyz');
            sqlError.sql = 'SELECT * FROM secret_table';

            sendSafeError(res, sqlError, 'Error al consultar datos');

            assert.strictEqual(res.statusCode, 500);
            assert.strictEqual(res.body.message, 'Error al consultar datos');
            // Ensure raw SQL query is not sent to client
            assert.strictEqual(res.body.sql, undefined);
        });
    });

    describe('sanitizeData (Bitácora Sensitive Redaction)', () => {
        it('should recursively redact passwords, secrets, tokens and keys', () => {
            const input = {
                username: 'admin',
                password: 'superSecretPassword123!',
                details: {
                    apiKey: 'AIzaSyExampleKey12345',
                    nested: {
                        secret: 'confidential_jwt_token',
                        token: 'bearer-token-here',
                        pin: '1234',
                        cvv: '999',
                        safeField: 'visibleData'
                    }
                },
                roles: ['admin', 'manager'],
                credentials: {
                    pass: 'oldPassword'
                }
            };

            const output = sanitizeData(input);

            assert.strictEqual(output.username, 'admin');
            assert.strictEqual(output.password, '***');
            assert.strictEqual(output.details.apiKey, '***');
            assert.strictEqual(output.details.nested.secret, '***');
            assert.strictEqual(output.details.nested.token, '***');
            assert.strictEqual(output.details.nested.pin, '***');
            assert.strictEqual(output.details.nested.cvv, '***');
            assert.strictEqual(output.details.nested.safeField, 'visibleData');
            assert.strictEqual(output.credentials, '***');
            assert.deepStrictEqual(output.roles, ['admin', 'manager']);
        });
    });
});
