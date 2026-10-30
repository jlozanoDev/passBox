import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'node:crypto';

/**
 * Vault crypto engine (spec S6/S7/S10): AES-256-GCM with a
 * PBKDF2-derived key. The master password never leaves memory and
 * is never persisted anywhere.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BYTES = 32;

const ALGORITHM = 'aes-256-gcm';
const DIGEST = 'sha256';

/**
 * Derive the 256-bit vault key from the master password.
 * @param {string} masterPassword
 * @param {Buffer} salt 16-byte vault salt
 * @returns {Buffer} 32-byte key
 */
export function deriveKey(masterPassword, salt) {
  return pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, KEY_BYTES, DIGEST);
}

/**
 * Encrypt a payload with an already-derived key (session save path).
 * @param {object} payload
 * @param {Buffer} key 32-byte key
 * @param {Buffer} salt 16-byte vault salt ( travels in the envelope, public by design )
 * @returns {{salt: string, iv: string, authTag: string, ciphertext: string}}
 */
export function encryptWithKey(payload, key, salt) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * Decrypt an envelope with an already-derived key (session path).
 * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
 * @param {Buffer} key 32-byte key
 * @returns {object} plaintext JSON
 */
export function decryptWithKey(envelope, key) {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Encrypt a vault payload into the on-disk/network envelope.
 * The salt travels in the envelope (public by design) because key
 * derivation must run before decryption (see feature doc S10).
 *
 * @param {object} payload Plaintext vault JSON
 * @param {string} masterPassword
 * @returns {{salt: string, iv: string, authTag: string, ciphertext: string}} base64 fields
 */
export function createVault(payload, masterPassword) {
  const salt = randomBytes(SALT_BYTES);
  const key = deriveKey(masterPassword, salt);
  try {
    return encryptWithKey(payload, key, salt);
  } finally {
    key.fill(0);
  }
}

/**
 * Decrypt an envelope back into the vault payload. GCM auth-tag
 * verification rejects wrong passwords and tampered ciphertext.
 *
 * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
 * @param {string} masterPassword
 * @returns {object} plaintext vault JSON
 */
export function openVault(envelope, masterPassword) {
  const salt = Buffer.from(envelope.salt, 'base64');
  const key = deriveKey(masterPassword, salt);
  try {
    return decryptWithKey(envelope, key);
  } finally {
    key.fill(0);
  }
}
