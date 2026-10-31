import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  SALT_BYTES,
} from '../crypto/vault.js';

/**
 * Local vault store (spec S1/S2/S9): owns the passbox.vault file and
 * the in-memory session key. The master password is never stored —
 * only the derived key lives in memory, and lock() zeroes it.
 */

export const VAULT_FILENAME = 'passbox.vault';

export function createVaultStore(baseDir) {
  const vaultPath = join(baseDir, VAULT_FILENAME);
  /** @type {Buffer|null} derived AES key, present only while unlocked */
  let sessionKey = null;

  function requireUnlocked() {
    if (!sessionKey) {
      throw new Error('Vault is locked');
    }
  }

  /** Atomic replace: write a temp file, then rename over the vault. */
  function writeEnvelopeAtomic(envelope) {
    const tmpPath = `${vaultPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(envelope), 'utf8');
    renameSync(tmpPath, vaultPath);
  }

  return {
    status() {
      return { exists: existsSync(vaultPath), unlocked: sessionKey !== null };
    },

    /**
     * First run: initialize an empty vault (S1 first-launch path).
     * @param {string} masterPassword
     */
    create(masterPassword) {
      if (existsSync(vaultPath)) {
        throw new Error('Vault already exists');
      }
      const salt = randomBytes(SALT_BYTES);
      const payload = {
        version: '1.0.0',
        salt: salt.toString('base64'),
        updatedAt: new Date().toISOString(),
        items: [],
      };
      sessionKey = deriveKey(masterPassword, salt);
      const envelope = encryptWithKey(payload, sessionKey, salt);
      writeEnvelopeAtomic(envelope);
      return payload;
    },

    /**
     * Later launches: decrypt the existing vault (S1 unlock path).
     * @param {string} masterPassword
     */
    unlock(masterPassword) {
      if (!existsSync(vaultPath)) {
        throw new Error('Vault does not exist');
      }
      const envelope = JSON.parse(readFileSync(vaultPath, 'utf8'));
      const salt = Buffer.from(envelope.salt, 'base64');
      const derived = deriveKey(masterPassword, salt);
      try {
        const payload = decryptWithKey(envelope, derived);
        // Transfer ownership to the session: keep the derived key for
        // saves without paying PBKDF2 twice.
        sessionKey = derived;
        return payload;
      } catch (err) {
        derived.fill(0);
        throw err;
      }
    },

    /**
     * Encrypt and persist a mutated payload with the session key.
     * Cloud transfer of the resulting file lands in T6.
     * @param {object} payload
     * @returns {object} the payload as persisted (refreshed updatedAt)
     */
    save(payload) {
      requireUnlocked();
      const toPersist = {
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      const envelope = encryptWithKey(
        toPersist,
        sessionKey,
        Buffer.from(toPersist.salt, 'base64'),
      );
      writeEnvelopeAtomic(envelope);
      return toPersist;
    },

    /**
     * Read the raw ciphertext envelope from disk without decrypting.
     * The upload transport takes its bytes from here — never from the
     * renderer, which only ever holds plaintext (verifier blocker 1).
     * @returns {{salt: string, iv: string, authTag: string, ciphertext: string}}
     */
    readEnvelope() {
      if (!existsSync(vaultPath)) {
        throw new Error('Vault does not exist');
      }
      return JSON.parse(readFileSync(vaultPath, 'utf8'));
    },

    /** Drop and overwrite the session key (RNF-04). */
    lock() {
      if (sessionKey) {
        sessionKey.fill(0);
        sessionKey = null;
      }
    },

    /**
     * Encrypt an auxiliary secret (e.g. the Drive refresh token) with
     * the session key so it reaches disk only as ciphertext (S5).
     * @param {object} data
     * @returns {{iv: string, authTag: string, ciphertext: string}}
     */
    encryptSessionData(data) {
      requireUnlocked();
      // Fresh random salt+IV per blob: the salt field in the envelope
      // is not used for derivation here, it only keeps the envelope
      // shape consistent; confidentiality comes from the session key.
      return encryptWithKey(data, sessionKey, randomBytes(SALT_BYTES));
    },

    /**
     * Decrypt an auxiliary secret encrypted with the session key.
     * @param {{iv: string, authTag: string, ciphertext: string}} blob
     * @returns {object}
     */
    decryptSessionData(blob) {
      requireUnlocked();
      return decryptWithKey(blob, sessionKey);
    },

    /**
     * Decrypt a vault envelope with the current session key — the
     * lineage check used by sync: same salt+key succeeds, any other
     * vault fails GCM authentication.
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @returns {object} plaintext payload
     */
    decryptWithSession(envelope) {
      requireUnlocked();
      return decryptWithKey(envelope, sessionKey);
    },

    /**
     * Replace the local vault file with an envelope already verified
     * by the caller (sync pull). Session must be unlocked.
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     */
    replaceEnvelope(envelope) {
      requireUnlocked();
      writeEnvelopeAtomic(envelope);
    },

    /**
     * Preview a remote vault from another device: verify the master
     * password against the envelope's own salt and decrypt WITHOUT
     * persisting or touching the session — sync compares recency
     * against this payload before ever adopting (verifier B1).
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @param {string} masterPassword
     * @returns {object} decrypted remote payload
     */
    previewRemoteWithPassword(envelope, masterPassword) {
      const derived = deriveKey(
        masterPassword,
        Buffer.from(envelope.salt, 'base64'),
      );
      try {
        return decryptWithKey(envelope, derived);
      } finally {
        derived.fill(0);
      }
    },

    /**
     * Adopt a remote vault envelope from another device: verify the
     * password, persist the envelope atomically FIRST, and only then
     * swap the session key — a failed write must leave the session
     * matching the file on disk (verifier B2).
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @param {string} masterPassword
     * @returns {object} decrypted remote payload
     */
    adoptRemote(envelope, masterPassword) {
      const derived = deriveKey(
        masterPassword,
        Buffer.from(envelope.salt, 'base64'),
      );
      let payload;
      try {
        payload = decryptWithKey(envelope, derived);
      } catch (err) {
        derived.fill(0);
        throw err;
      }
      try {
        writeEnvelopeAtomic(envelope);
      } catch (err) {
        derived.fill(0);
        throw err;
      }
      if (sessionKey) {
        sessionKey.fill(0);
      }
      sessionKey = derived;
      return payload;
    },
  };
}
