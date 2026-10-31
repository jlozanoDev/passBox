import Store from 'electron-store';

/**
 * S3 config store (spec S1/S2 BYO static credentials): holds the
 * user-entered endpoint, region, bucket and access key id in plain
 * form — none of them secret — plus the encrypted blob carrying the
 * secret access key. Only ciphertext and non-sensitive identifiers
 * live here: the secret key itself is encrypted with the vault
 * session key (encryptSessionData) before it ever reaches disk, the
 * same pattern v1.0 used for the Drive refresh token.
 */

const KEYS = {
  endpoint: 's3.endpoint',
  region: 's3.region',
  bucket: 's3.bucket',
  accessKeyId: 's3.accessKeyId',
  secretBlob: 's3.secretBlob',
  lastSync: 'sync.last',
};

const REQUIRED_FIELDS = ['endpoint', 'region', 'bucket', 'accessKeyId'];

/**
 * @param {string} [cwd] test-only override for the config directory
 */
export function createS3Config(cwd) {
  const store = new Store(
    cwd ? { cwd, name: 'passbox-config' } : { name: 'passbox-config' },
  );

  return {
    /**
     * The four non-secret connection fields. Null until the user has
     * completed the settings form at least once.
     * @returns {{endpoint: string, region: string, bucket: string, accessKeyId: string}|null}
     */
    getCredentials() {
      const values = {};
      for (const field of REQUIRED_FIELDS) {
        const value = store.get(KEYS[field]);
        if (!value) return null;
        values[field] = value;
      }
      return values;
    },

    /** @param {{endpoint: string, region: string, bucket: string, accessKeyId: string}} settings */
    setCredentials(settings) {
      const missing = REQUIRED_FIELDS.filter((field) => !settings?.[field]);
      if (missing.length > 0) {
        throw new Error(
          `Missing S3 settings: ${missing.join(', ')} are required`,
        );
      }
      for (const field of REQUIRED_FIELDS) {
        store.set(KEYS[field], settings[field]);
      }
    },

    /** @returns {{iv: string, authTag: string, ciphertext: string}|null} */
    getTokenBlob() {
      return store.get(KEYS.secretBlob) ?? null;
    },

    /** Encrypted secret-access-key blob — ciphertext only. */
    setTokenBlob(blob) {
      store.set(KEYS.secretBlob, blob);
    },

    clearToken() {
      store.delete(KEYS.secretBlob);
    },

    /** Persist the last sync outcome (S11: non-sensitive sync state). */
    recordSync(ok, error) {
      store.set(KEYS.lastSync, {
        at: new Date().toISOString(),
        ok,
        ...(error ? { error } : {}),
      });
    },

    getLastSync() {
      return store.get(KEYS.lastSync) ?? null;
    },

    getStatus() {
      return {
        hasCredentials: REQUIRED_FIELDS.every((field) =>
          Boolean(store.get(KEYS[field])),
        ),
        connected: Boolean(store.get(KEYS.secretBlob)),
      };
    },
  };
}
