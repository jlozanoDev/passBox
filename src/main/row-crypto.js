import { randomBytes } from 'node:crypto';
import { SALT_BYTES, decryptWithKey, encryptWithKey } from '../crypto/vault.js';

/**
 * Per-row crypto for the Supabase backend (specs S2/S3).
 *
 * The secret value is encrypted in the client with a data key derived
 * from the master password and a SHARED non-sensitive salt stored in
 * passbox_meta. Two Passbox instances with the same master password
 * derive the same key and can decrypt each other's rows; a different
 * password fails GCM authentication. Rows never carry the salt field —
 * it lives once in meta so every client agrees.
 */

const ROW_KEYS = ['iv', 'authTag', 'ciphertext'];

/**
 * Shape gate for a row ciphertext envelope (S2: plaintext never stored).
 * @param {unknown} row
 */
export function assertRowEnvelope(row) {
  const valid =
    row !== null &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    ROW_KEYS.every(
      (key) => typeof row[key] === 'string' && row[key].length > 0,
    );
  if (!valid) {
    throw new Error(
      'Invalid row envelope: expected base64 strings {iv, authTag, ciphertext}',
    );
  }
}

/** Fresh shared salt for a brand-new database (base64). */
export function createSharedSalt() {
  return randomBytes(SALT_BYTES).toString('base64');
}

/**
 * Read the shared salt from the meta row `{key:'vault_salt', value}`.
 * @param {{value: string}|null|undefined} metaRow
 * @returns {Buffer}
 */
export function parseSaltFromMeta(metaRow) {
  const value = metaRow?.value;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Shared vault salt is missing from passbox_meta');
  }
  const salt = Buffer.from(value, 'base64');
  if (salt.length !== SALT_BYTES) {
    throw new Error('Shared vault salt is missing from passbox_meta');
  }
  return salt;
}

/**
 * Encrypt one secret item for a row.
 * @param {object} item plaintext item (title, secret, …)
 * @param {Buffer} key 32-byte data key
 * @returns {{iv: string, authTag: string, ciphertext: string}}
 */
export function encryptRow(item, key) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Row item must be a non-null object');
  }
  const { salt: _salt, ...row } = encryptWithKey(
    item,
    key,
    randomBytes(SALT_BYTES),
  );
  assertRowEnvelope(row);
  return row;
}

/**
 * Decrypt a row envelope back into the plaintext item.
 * @param {{iv: string, authTag: string, ciphertext: string}} row
 * @param {Buffer} key 32-byte data key
 * @returns {object}
 */
export function decryptRow(row, key) {
  assertRowEnvelope(row);
  return decryptWithKey({ salt: '', ...row }, key);
}
