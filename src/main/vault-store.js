import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
      const envelope = encryptWithKey(
        payload,
        deriveKey(masterPassword, salt),
        salt,
      );
      writeFileSync(vaultPath, JSON.stringify(envelope), 'utf8');
      sessionKey = deriveKey(masterPassword, salt);
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
      const payload = decryptWithKey(
        envelope,
        deriveKey(masterPassword, Buffer.from(envelope.salt, 'base64')),
      );
      sessionKey = deriveKey(
        masterPassword,
        Buffer.from(envelope.salt, 'base64'),
      );
      return payload;
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
      writeFileSync(vaultPath, JSON.stringify(envelope), 'utf8');
      return toPersist;
    },

    /** Drop and overwrite the session key (RNF-04). */
    lock() {
      if (sessionKey) {
        sessionKey.fill(0);
        sessionKey = null;
      }
    },
  };
}
