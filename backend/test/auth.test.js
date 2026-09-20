const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { authenticateToken, requirePermission, requireRole, JWT_SECRET } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

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

        it('should return 403 when token is invalid or expired', () => {
            const req = { headers: { authorization: 'Bearer invalid.token.here' } };
            const res = createMockRes();
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
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

        it('should deny 403 when user role is not permitted', () => {
            const req = { user: { role: 'User', role_id: 2 } };
            const res = createMockRes();
            let nextCalled = false;

            requireRole('Administrator')(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(nextCalled, false);
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
});
