process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    encryptSecret,
    decryptSecret,
    generateAgentToken,
    hashSecret,
    timingSafeEqualHex
} = require('../utils/cryptoVault');
const nasService = require('../services/nasBackupService');
const nasRouter = require('../routes/nasBackup');
const { sanitizeData } = require('../middleware/bitacora');
const { requirePermission } = require('../middleware/auth');

describe('Panel de Control NAS & Respaldos de Base de Datos', () => {
    describe('Bóveda Criptográfica AES-256-GCM (cryptoVault)', () => {
        it('cifra y descifra secretos manteniendo integridad autenticada', () => {
            const plain = 'Syp3_Synology!2026#Secret';
            const encrypted = encryptSecret(plain);
            assert.ok(encrypted.startsWith('enc:v1:'));
            assert.notStrictEqual(encrypted, plain);
            assert.strictEqual(decryptSecret(encrypted), plain);
        });

        it('detecta manipulación del texto cifrado (GCM AuthTag)', () => {
            const encrypted = encryptSecret('clave-nas-raulsosa');
            const tampered = encrypted.slice(0, -2) + (encrypted.endsWith('00') ? 'ff' : '00');
            assert.throws(() => decryptSecret(tampered));
        });

        it('genera tokens de agente Synology verificables en tiempo constante', () => {
            const bundle = generateAgentToken();
            assert.ok(bundle.token.startsWith('sipe_nas_'));
            assert.strictEqual(bundle.hash, hashSecret(bundle.token));
            assert.strictEqual(timingSafeEqualHex(bundle.hash, hashSecret(bundle.token)), true);
            assert.strictEqual(timingSafeEqualHex(bundle.hash, hashSecret('otro_token')), false);
            assert.strictEqual(decryptSecret(bundle.encrypted), bundle.token);
        });
    });

    describe('Validaciones de Red, Seguridad y Rutas Synology', () => {
        it('detecta correctamente IPs privadas LAN (192.168.31.222) vs VPS público (5.252.55.29)', () => {
            assert.strictEqual(nasService.isPrivateIpAddress('192.168.31.222'), true);
            assert.strictEqual(nasService.isPrivateIpAddress('10.0.0.15'), true);
            assert.strictEqual(nasService.isPrivateIpAddress('172.16.5.2'), true);
            assert.strictEqual(nasService.isPrivateIpAddress('127.0.0.1'), true);
            assert.strictEqual(nasService.isPrivateIpAddress('5.252.55.29'), false);
            assert.strictEqual(nasService.isPrivateIpAddress('nas.sipesv.com'), false);
        });

        it('rechaza nombres de bases de sistema e inyecciones en validateSafeDatabaseName', () => {
            assert.strictEqual(nasService.validateSafeDatabaseName('db_sipe_admin'), true);
            assert.strictEqual(nasService.validateSafeDatabaseName('db_sistema_saas'), true);
            assert.strictEqual(nasService.validateSafeDatabaseName('mysql'), false);
            assert.strictEqual(nasService.validateSafeDatabaseName('information_schema'), false);
            assert.strictEqual(nasService.validateSafeDatabaseName('db_sipe; rm -rf /'), false);
            assert.strictEqual(nasService.validateSafeDatabaseName('../etc/passwd'), false);
        });

        it('bloquea path traversal y metacaracteres de shell en ruta_destino', () => {
            assert.strictEqual(nasService.validateSafeRemotePath('/volume1/backups/sipe-db'), true);
            assert.strictEqual(nasService.validateSafeRemotePath('/backups/sipe-db'), true);
            assert.strictEqual(nasService.validateSafeRemotePath('/volume1/../etc'), false);
            assert.strictEqual(nasService.validateSafeRemotePath('/backups; cat /etc/shadow'), false);
            assert.strictEqual(nasService.validateSafeRemotePath('relative/path'), false);
        });

        it('normaliza rutas /volume1/... a rutas de FileStation API', () => {
            assert.strictEqual(nasService.normalizeDsmSharePath('/volume1/backups/sipe-db'), '/backups/sipe-db');
            assert.strictEqual(nasService.normalizeDsmSharePath('/volume2/Respaldos/DB/'), '/Respaldos/DB');
            assert.strictEqual(nasService.normalizeDsmSharePath('/backups/sipe-db'), '/backups/sipe-db');
        });

        it('normaliza y cifra payload del Synology NAS 192.168.31.222 / raulsosa', () => {
            const normalized = nasService.validateAndNormalizeNasPayload({
                nombre: 'Synology NAS Oficina',
                tipo_nas: 'synology',
                modo_conexion: 'synology_pull',
                host_lan: '192.168.31.222',
                usuario: 'raulsosa',
                password: 'miPasswordSecreta',
                ruta_destino: '/volume1/backups/sipe-db',
                servidor_origen_ip: '5.252.55.29',
                frecuencia: 'daily',
                retencion_dias: 30
            });
            assert.strictEqual(normalized.host_lan, '192.168.31.222');
            assert.strictEqual(normalized.usuario, 'raulsosa');
            assert.strictEqual(normalized.servidor_origen_ip, '5.252.55.29');
            assert.ok(normalized.password_enc.startsWith('enc:v1:'));
            assert.strictEqual(decryptSecret(normalized.password_enc), 'miPasswordSecreta');
            assert.strictEqual(normalized.cron_expresion, '0 2 * * *');
        });

        it('rechaza expresiones cron inválidas en modo custom', () => {
            assert.throws(() => {
                nasService.validateAndNormalizeNasPayload({
                    nombre: 'NAS Test',
                    host_lan: '192.168.31.222',
                    usuario: 'raulsosa',
                    frecuencia: 'custom',
                    cron_expresion: 'invalido cron'
                });
            }, /cron/i);
        });
    });

    describe('Sanitización de Respuestas, Script Synology y Parser WebDAV', () => {
        it('nunca expone contraseñas cifradas, llaves SSH ni hashes de token al cliente', () => {
            const tokenBundle = generateAgentToken();
            const safe = nasService.sanitizeNasServerForClient({
                id: 1,
                nombre: 'Synology NAS Oficina',
                tipo_nas: 'synology',
                modo_conexion: 'synology_pull',
                host_lan: '192.168.31.222',
                host_remoto: '',
                puerto: 5001,
                usar_ssl: 1,
                permitir_cert_autofirmado: 1,
                usuario: 'raulsosa',
                password_enc: encryptSecret('secret123'),
                ssh_private_key_enc: encryptSecret('---KEY---'),
                ruta_destino: '/volume1/backups/sipe-db',
                servidor_origen_ip: '5.252.55.29',
                bases_datos_json: '["db_sipe_admin"]',
                respaldar_todas: 1,
                programacion_activa: 1,
                frecuencia: 'daily',
                cron_expresion: '0 2 * * *',
                retencion_dias: 30,
                notificar_telegram: 1,
                es_principal: 1,
                activo: 1,
                agent_token_hash: tokenBundle.hash,
                agent_token_prefix: tokenBundle.prefix,
                agent_token_enc: tokenBundle.encrypted,
                estado_conexion: 'pendiente'
            });

            assert.strictEqual(safe.password, '');
            assert.strictEqual(safe.has_password, true);
            assert.strictEqual(safe.has_ssh_key, true);
            assert.strictEqual(safe.has_agent_token, true);
            assert.strictEqual(safe.es_ip_privada, true);
            assert.strictEqual(safe.password_enc, undefined);
            assert.strictEqual(safe.ssh_private_key_enc, undefined);
            assert.strictEqual(safe.agent_token_hash, undefined);
            assert.strictEqual(safe.agent_token_enc, undefined);
        });

        it('genera script Bash para Synology DSM con token, destino, verificación SHA-256 y retención', () => {
            const tokenBundle = generateAgentToken();
            const script = nasService.buildSynologyPullScript({
                id: 1,
                nombre: 'Synology NAS Oficina',
                host_lan: '192.168.31.222',
                usuario: 'raulsosa',
                ruta_destino: '/volume1/backups/sipe-db',
                servidor_origen_ip: '5.252.55.29',
                retencion_dias: 30,
                agent_token_enc: tokenBundle.encrypted
            }, 'https://admin.sipesv.com');

            assert.ok(script.includes('SIPE_URL="https://admin.sipesv.com"'));
            assert.ok(script.includes(`NAS_TOKEN="${tokenBundle.token}"`));
            assert.ok(script.includes('DEST_DIR="/volume1/backups/sipe-db"'));
            assert.ok(script.includes('RETENTION_DAYS="30"'));
            assert.ok(script.includes('/api/seguridad/nas/agent/manifest'));
            assert.ok(script.includes('/api/seguridad/nas/agent/dump/'));
            assert.ok(script.includes('/api/seguridad/nas/agent/report'));
            assert.ok(script.includes('sha256sum'));
        });

        it('parsea respuestas XML PROPFIND de WebDAV filtrando respaldos .sql.gz', () => {
            const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
            <D:multistatus xmlns:D="DAV:">
              <D:response>
                <D:href>/backups/sipe-db/</D:href>
                <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
              </D:response>
              <D:response>
                <D:href>/backups/sipe-db/db_sipe_admin_20261122_020000.sql.gz</D:href>
                <D:propstat><D:prop>
                  <D:getcontentlength>452100</D:getcontentlength>
                  <D:getlastmodified>Sun, 22 Nov 2026 08:00:00 GMT</D:getlastmodified>
                </D:prop></D:propstat>
              </D:response>
              <D:response>
                <D:href>/backups/sipe-db/db_sistema_saas_20261123_020000.sql.gz</D:href>
                <D:propstat><D:prop>
                  <D:getcontentlength>1284000</D:getcontentlength>
                  <D:getlastmodified>Mon, 23 Nov 2026 08:00:00 GMT</D:getlastmodified>
                </D:prop></D:propstat>
              </D:response>
              <D:response>
                <D:href>/backups/sipe-db/readme.txt</D:href>
                <D:propstat><D:prop><D:getcontentlength>20</D:getcontentlength></D:prop></D:propstat>
              </D:response>
            </D:multistatus>`;

            const files = nasService.parseWebdavPropfindXml(sampleXml, '/backups/sipe-db');
            assert.strictEqual(files.length, 2);
            assert.strictEqual(files[0].name, 'db_sistema_saas_20261123_020000.sql.gz');
            assert.strictEqual(files[0].sizeBytes, 1284000);
            assert.strictEqual(files[1].name, 'db_sipe_admin_20261122_020000.sql.gz');
        });

        it('la bitácora enmascara automáticamente password y ssh_private_key en solicitudes NAS', () => {
            const sanitized = sanitizeData({
                nombre: 'Synology NAS Oficina',
                host_lan: '192.168.31.222',
                usuario: 'raulsosa',
                password: 'SuperSecretPassword',
                ssh_private_key: '-----BEGIN OPENSSH PRIVATE KEY-----'
            });
            assert.strictEqual(sanitized.nombre, 'Synology NAS Oficina');
            assert.strictEqual(sanitized.usuario, 'raulsosa');
            assert.strictEqual(sanitized.password, '***');
            assert.strictEqual(sanitized.ssh_private_key, '***');
        });
    });

    describe('Contratos de Rutas y Autorización', () => {
        it('expone todas las rutas de gestión NAS y de agente Synology Pull', () => {
            const signatures = nasRouter.stack
                .filter((layer) => layer.route)
                .map((layer) => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);

            const expected = [
                'GET /overview',
                'GET /databases',
                'POST /servers',
                'PUT /servers/:id',
                'DELETE /servers/:id',
                'POST /servers/:id/test',
                'POST /servers/:id/backup-now',
                'POST /servers/:id/rotate-token',
                'GET /servers/:id/synology-script',
                'GET /servers/:id/files',
                'GET /logs',
                'GET /download-db/:dbName',
                'GET /reporte-pdf',
                'GET /agent/manifest',
                'GET /agent/dump/:dbName',
                'POST /agent/report',
                'POST /agent/heartbeat'
            ];
            for (const sig of expected) {
                assert.ok(signatures.includes(sig), `Falta ruta esperada en nasBackup.js: ${sig}`);
            }
        });

        it('bloquea con 403 a usuarios sin permiso /dashboard/seguridad/nas o manage_nas_backups', () => {
            const req = { user: { id: 9, role_id: 3, permissions: ['/dashboard'] } };
            const res = {
                statusCode: 200,
                body: null,
                status(code) { this.statusCode = code; return this; },
                json(data) { this.body = data; return this; }
            };
            let allowed = false;
            requirePermission(['manage_nas_backups', '/dashboard/seguridad/nas'])(req, res, () => { allowed = true; });
            assert.strictEqual(allowed, false);
            assert.strictEqual(res.statusCode, 403);
        });
    });
});
