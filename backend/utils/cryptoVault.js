const crypto = require('crypto');

const VAULT_PREFIX = 'enc:v1:';
const IV_BYTES = 12;

/**
 * Deriva una clave simétrica de 32 bytes (AES-256) para cifrar credenciales
 * almacenadas en base de datos (contraseñas NAS, llaves SSH, tokens de agente).
 */
function getVaultKey() {
    const rawMaterial =
        process.env.NAS_ENCRYPTION_KEY ||
        process.env.JWT_SECRET ||
        'sipeadmin_dev_nas_vault_key_change_in_production';
    return crypto.createHash('sha256').update(`sipe_nas_vault_v1::${rawMaterial}`, 'utf8').digest();
}

/**
 * Cifra un texto plano con AES-256-GCM autenticado.
 * Devuelve null si el texto está vacío.
 */
function encryptSecret(plaintext) {
    if (plaintext === null || plaintext === undefined || String(plaintext) === '') {
        return null;
    }
    const text = String(plaintext);
    if (text.startsWith(VAULT_PREFIX)) {
        return text;
    }
    const iv = crypto.randomBytes(IV_BYTES);
    const key = getVaultKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${VAULT_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra un secreto previamente cifrado con encryptSecret().
 * Soporta texto legado sin prefijo si alguna fila antigua lo contuviera.
 */
function decryptSecret(payload) {
    if (!payload || typeof payload !== 'string') return '';
    if (!payload.startsWith(VAULT_PREFIX)) {
        return payload;
    }
    const parts = payload.slice(VAULT_PREFIX.length).split(':');
    if (parts.length !== 3) {
        throw new Error('Formato de secreto cifrado inválido');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');
    const key = getVaultKey();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

/**
 * Genera un token criptográfico de alta entropía para agentes Synology Pull.
 */
function generateAgentToken() {
    const token = `sipe_nas_${crypto.randomBytes(24).toString('hex')}`;
    const hash = hashSecret(token);
    const prefix = `${token.slice(0, 15)}...${token.slice(-4)}`;
    const encrypted = encryptSecret(token);
    return { token, hash, prefix, encrypted };
}

/**
 * Hash SHA-256 hexadecimal determinista para búsqueda/validación de tokens.
 */
function hashSecret(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

/**
 * Comparación en tiempo constante para hashes hexadecimales.
 */
function timingSafeEqualHex(hexA, hexB) {
    if (typeof hexA !== 'string' || typeof hexB !== 'string') return false;
    const a = Buffer.from(hexA, 'utf8');
    const b = Buffer.from(hexB, 'utf8');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = {
    VAULT_PREFIX,
    encryptSecret,
    decryptSecret,
    generateAgentToken,
    hashSecret,
    timingSafeEqualHex
};
