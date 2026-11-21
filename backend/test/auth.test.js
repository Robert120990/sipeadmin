const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authRouter = require('../routes/auth');
const { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser, resolveLiveUserAuthState, invalidateUserAuthCache } = require('../middleware/auth');
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

    describe('validatePasswordInput & findLoginUser (Password Update & Login Hardening)', () => {
        const { validatePasswordInput, findLoginUser } = authRouter._helpers;

        it('debe permitir omitir contraseña al editar cuando se deja vacía', () => {
            assert.deepStrictEqual(validatePasswordInput('', { required: false }), { shouldUpdate: false, error: null });
            assert.deepStrictEqual(validatePasswordInput(undefined, { required: false }), { shouldUpdate: false, error: null });
        });

        it('debe rechazar contraseñas de solo espacios (incluyendo >= 8 espacios) o con espacios al inicio/final', () => {
            const spacesOnly = validatePasswordInput('        ', { required: false });
            assert.strictEqual(spacesOnly.shouldUpdate, false);
            assert.match(spacesOnly.error, /8 caracteres/);

            const trailingSpace = validatePasswordInput('Clave1234 ', { required: false });
            assert.strictEqual(trailingSpace.shouldUpdate, false);
            assert.match(trailingSpace.error, /espacios/);

            const leadingSpace = validatePasswordInput(' Clave1234', { required: true });
            assert.strictEqual(leadingSpace.shouldUpdate, false);
            assert.match(leadingSpace.error, /espacios/);
        });

        it('debe rechazar contraseñas menores a 8 caracteres y aceptar válidas', () => {
            const shortPwd = validatePasswordInput('xiomara', { required: false });
            assert.strictEqual(shortPwd.shouldUpdate, false);
            assert.match(shortPwd.error, /al menos 8 caracteres/);

            const okPwd = validatePasswordInput('ClaveSegura2026', { required: false });
            assert.deepStrictEqual(okPwd, { shouldUpdate: true, value: 'ClaveSegura2026', error: null });
        });

        it('findLoginUser debe resolver usuario por username case-insensitive y por correo único', async () => {
            const fakeUser = {
                id: 9,
                username: 'xiomara',
                email: 'Contabilidad@andelsa.com.sv',
                status: 'active',
                role_id: 2,
                role_name: 'Asistente'
            };

            const mockDb = {
                query: async (sql, params) => {
                    const needle = String(params[0] || '').toLowerCase();
                    if (sql.includes('LOWER(u.username)')) {
                        return [needle === 'xiomara' ? [fakeUser] : []];
                    }
                    if (sql.includes('LOWER(u.email)')) {
                        return [needle === 'contabilidad@andelsa.com.sv' ? [fakeUser] : []];
                    }
                    return [[]];
                }
            };

            const byUser = await findLoginUser(mockDb, 'Xiomara');
            assert.strictEqual(byUser.id, 9);

            const byEmail = await findLoginUser(mockDb, 'contabilidad@andelsa.com.sv');
            assert.strictEqual(byEmail.id, 9);

            const unknown = await findLoginUser(mockDb, 'otro@andelsa.com.sv');
            assert.strictEqual(unknown, null);
        });

        it('findLoginUser no debe autenticar si un correo está duplicado en múltiples cuentas', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('LOWER(u.username)')) return [[]];
                    if (sql.includes('LOWER(u.email)')) return [[{ id: 1 }, { id: 2 }]];
                    return [[]];
                }
            };

            const dup = await findLoginUser(mockDb, 'compartido@andelsa.com.sv');
            assert.strictEqual(dup, null);
        });

        it('flujo completo PUT /users/:id y POST /login permite actualizar contraseña y luego iniciar sesión por username o correo', async () => {
            const dbModule = require('../db');
            const origGetDb = dbModule.getDb;
            const origGetDbIfReady = dbModule.getDbIfReady;
            const userRecord = {
                id: 9,
                username: 'xiomara',
                nombre: 'Xiomara Navarro',
                email: 'Contabilidad@andelsa.com.sv',
                password: await bcrypt.hash('OldPass123', 10),
                role_id: 2,
                role_name: 'Asistente',
                status: 'active',
                token_version: 1
            };

            let mockQueryCalls = 0;
            const mockDb = {
                query: async (sql, params) => {
                    mockQueryCalls++;
                    if (sql.includes('SELECT u.id, u.role_id, u.status, r.name as role_name FROM users u')) {
                        return [Number(params[0]) === 9 ? [{ id: userRecord.id, role_id: userRecord.role_id, status: userRecord.status, role_name: userRecord.role_name }] : []];
                    }
                    if (sql.includes('SELECT u.id, u.username, u.nombre, u.status, u.role_id, u.token_version')) {
                        return [Number(params[0]) === 9 ? [userRecord] : []];
                    }
                    if (sql.includes('SELECT id, name FROM roles')) {
                        return [[{ id: 2, name: 'Asistente' }]];
                    }
                    if (sql.startsWith('UPDATE users SET')) {
                        const targetId = Number(params[params.length - 1]);
                        assert.strictEqual(targetId, 9);
                        const hashParam = params.find(p => typeof p === 'string' && p.startsWith('$2'));
                        assert.ok(hashParam, 'Debe incluir nuevo hash bcrypt al actualizar contraseña');
                        userRecord.password = hashParam;
                        if (sql.includes('token_version')) {
                            userRecord.token_version += 1;
                        }
                        return [{ affectedRows: 1 }];
                    }
                    if (sql.includes('LOWER(u.username)')) {
                        return [String(params[0]).toLowerCase() === 'xiomara' ? [userRecord] : []];
                    }
                    if (sql.includes('LOWER(u.email)')) {
                        return [String(params[0]).toLowerCase() === 'contabilidad@andelsa.com.sv' ? [userRecord] : []];
                    }
                    if (sql.includes('FROM permissions p JOIN role_permissions')) {
                        return [[{ name: '/dashboard' }, { name: '/dashboard/operaciones/tareas' }]];
                    }
                    return [[]];
                }
            };
            dbModule.getDb = () => mockDb;
            dbModule.getDbIfReady = () => mockDb;

            try {
                // Localizar handlers en authRouter
                const putLayer = authRouter.stack.find(l => l.route?.path === '/users/:id' && l.route.methods.put);
                const loginLayer = authRouter.stack.find(l => l.route?.path === '/login' && l.route.methods.post);
                assert.ok(putLayer && loginLayer);

                const putHandler = putLayer.route.stack[putLayer.route.stack.length - 1].handle;
                const loginHandler = loginLayer.route.stack[loginLayer.route.stack.length - 1].handle;

                // 0. Login previo con contraseña antigua (tv = 1)
                const oldLoginReq = { body: { username: 'xiomara', password: 'OldPass123' } };
                const oldLoginRes = createMockRes();
                await loginHandler(oldLoginReq, oldLoginRes);
                assert.strictEqual(oldLoginRes.statusCode, 200);
                const oldDecoded = jwt.verify(oldLoginRes.body.token, JWT_SECRET);

                // 1. Actualizar contraseña via PUT /users/9
                const putReq = {
                    params: { id: '9' },
                    user: { id: 2, username: 'raul', role_id: 1, role: 'Administrator' },
                    body: {
                        username: 'xiomara',
                        nombre: 'Xiomara Navarro',
                        email: 'Contabilidad@andelsa.com.sv',
                        password: 'NuevaClave2026!',
                        role_id: 2,
                        status: 'active'
                    }
                };
                const putRes = createMockRes();
                await putHandler(putReq, putRes);
                assert.strictEqual(putRes.statusCode, 200);
                assert.strictEqual(putRes.body.passwordUpdated, true);
                assert.strictEqual(putRes.body.sessionsInvalidated, true);

                // 2. Token antiguo debe quedar invalidado tras cambio de contraseña
                invalidateUserAuthCache(9);
                const oldLiveCheck = await resolveLiveUserAuthState(oldDecoded);
                assert.strictEqual(oldLiveCheck.ok, false);
                assert.strictEqual(oldLiveCheck.statusCode, 401);

                // 3. Simular usuario marcado previamente en caché de revocados y verificar que login lo restaura
                revokeUser(9);

                // 4. Login con username + nueva contraseña
                const loginReq1 = { body: { username: 'xiomara', password: 'NuevaClave2026!' } };
                const loginRes1 = createMockRes();
                await loginHandler(loginReq1, loginRes1);
                assert.strictEqual(loginRes1.statusCode, 200);
                assert.ok(loginRes1.body.token);
                assert.strictEqual(loginRes1.body.user.username, 'xiomara');

                // 5. Login con correo electrónico + nueva contraseña
                const loginReq2 = { body: { username: 'Contabilidad@andelsa.com.sv', password: 'NuevaClave2026!' } };
                const loginRes2 = createMockRes();
                await loginHandler(loginReq2, loginRes2);
                assert.strictEqual(loginRes2.statusCode, 200);
                assert.ok(loginRes2.body.token);

                // 6. Verificar que token nuevo pasa validación en vivo y refresca permisos
                const newDecoded = jwt.verify(loginRes1.body.token, JWT_SECRET);
                const newLiveCheck = await resolveLiveUserAuthState(newDecoded);
                assert.strictEqual(newLiveCheck.ok, true);
                assert.ok(newLiveCheck.user.permissions.includes('/dashboard/operaciones/tareas'));
                assert.ok(mockQueryCalls >= 6, 'Las pruebas deben ejecutarse contra mockDb sin tocar la BD real');
            } finally {
                dbModule.getDb = origGetDb;
                dbModule.getDbIfReady = origGetDbIfReady;
                restoreUser(9);
            }
        });

        it('PUT /users/:id debe impedir auto-desactivación, auto-degradación y correo inválido; PUT/DELETE /roles debe proteger Administrator', async () => {
            const dbModule = require('../db');
            const origGetDb = dbModule.getDb;
            const origGetDbIfReady = dbModule.getDbIfReady;

            const mockQuery = async (sql, params) => {
                if (sql.includes('SELECT id, name FROM roles WHERE id = ?')) {
                    return [Number(params[0]) === 1 ? [{ id: 1, name: 'Administrator' }] : []];
                }
                return [[]];
            };
            dbModule.getDb = () => ({
                query: mockQuery,
                getConnection: async () => ({
                    query: mockQuery,
                    beginTransaction: async () => {},
                    commit: async () => {},
                    rollback: async () => {},
                    release: () => {}
                })
            });
            dbModule.getDbIfReady = () => null;

            try {
                const putUserLayer = authRouter.stack.find(l => l.route?.path === '/users/:id' && l.route.methods.put);
                const putRoleLayer = authRouter.stack.find(l => l.route?.path === '/roles/:id' && l.route.methods.put);
                const delRoleLayer = authRouter.stack.find(l => l.route?.path === '/roles/:id' && l.route.methods.delete);
                const postRoleLayer = authRouter.stack.find(l => l.route?.path === '/roles' && l.route.methods.post);

                const putUserHandler = putUserLayer.route.stack[putUserLayer.route.stack.length - 1].handle;
                const putRoleHandler = putRoleLayer.route.stack[putRoleLayer.route.stack.length - 1].handle;
                const delRoleHandler = delRoleLayer.route.stack[delRoleLayer.route.stack.length - 1].handle;
                const postRoleHandler = postRoleLayer.route.stack[postRoleLayer.route.stack.length - 1].handle;

                // Auto-desactivación bloqueada
                const selfDeactivateRes = createMockRes();
                await putUserHandler({
                    params: { id: '2' },
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { status: 'inactive' }
                }, selfDeactivateRes);
                assert.strictEqual(selfDeactivateRes.statusCode, 400);

                // Auto-cambio de rol bloqueado
                const selfDemoteRes = createMockRes();
                await putUserHandler({
                    params: { id: '2' },
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { role_id: 2, status: 'active' }
                }, selfDemoteRes);
                assert.strictEqual(selfDemoteRes.statusCode, 400);

                // Correo con formato inválido bloqueado
                const badEmailRes = createMockRes();
                await putUserHandler({
                    params: { id: '9' },
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { email: 'correo-invalido' }
                }, badEmailRes);
                assert.strictEqual(badEmailRes.statusCode, 400);

                // Nombre de rol vacío bloqueado en POST /roles
                const emptyRoleRes = createMockRes();
                await postRoleHandler({
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { name: '   ', permissions: [] }
                }, emptyRoleRes);
                assert.strictEqual(emptyRoleRes.statusCode, 400);

                // Renombrar Administrator bloqueado en PUT /roles/1
                const renameAdminRes = createMockRes();
                await putRoleHandler({
                    params: { id: '1' },
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { name: 'OtroNombre', permissions: [] }
                }, renameAdminRes);
                assert.strictEqual(renameAdminRes.statusCode, 400);

                // Eliminar Administrator bloqueado en DELETE /roles/1
                const delAdminRes = createMockRes();
                await delRoleHandler({
                    params: { id: '1' },
                    user: { id: 2, role_id: 1, role: 'Administrator' }
                }, delAdminRes);
                assert.strictEqual(delAdminRes.statusCode, 400);

                // Config validation: puerto inválido e inyección CRLF en email
                const configRouter = require('../routes/config');
                const postConfigLayer = configRouter.stack.find(l => l.route?.path === '/config' && l.route.methods.post);
                const postEmailLayer = configRouter.stack.find(l => l.route?.path === '/config/email' && l.route.methods.post);
                const postConfigHandler = postConfigLayer.route.stack[postConfigLayer.route.stack.length - 1].handle;
                const postEmailHandler = postEmailLayer.route.stack[postEmailLayer.route.stack.length - 1].handle;

                const badPortRes = createMockRes();
                await postConfigHandler({
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { host: '127.0.0.1', user: 'root', database_name: 'db', port: 99999 }
                }, badPortRes);
                assert.strictEqual(badPortRes.statusCode, 400);

                const crlfEmailRes = createMockRes();
                await postEmailHandler({
                    user: { id: 2, role_id: 1, role: 'Administrator' },
                    body: { host: 'smtp.example.com', port: 587, user: 'noreply@example.com', from_address: 'SIPE\r\nBcc: attacker@evil.com' }
                }, crlfEmailRes);
                assert.strictEqual(crlfEmailRes.statusCode, 400);
            } finally {
                dbModule.getDb = origGetDb;
                dbModule.getDbIfReady = origGetDbIfReady;
            }
        });
    });
});
