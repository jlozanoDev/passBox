import Store from 'electron-store';

/**
 * Supabase config store (spec S1): holds the user-entered project URL
 * in plain form (not secret) plus encrypted blobs for the service role
 * key and the database connection string. Secrets are encrypted with
 * the vault session key (encryptSessionData) before they reach disk —
 * the same at-rest pattern the S3 secret used.
 */

const KEYS = {
  projectUrl: 'supabase.projectUrl',
  serviceKeyBlob: 'supabase.serviceKeyBlob',
  databaseUrlBlob: 'supabase.databaseUrlBlob',
  lastSync: 'sync.last',
};

/**
 * @param {string} [cwd] test-only override for the config directory
 */
export function createSupabaseConfig(cwd) {
  const store = new Store(
    cwd ? { cwd, name: 'passbox-config' } : { name: 'passbox-config' },
  );

  return {
    /** @returns {string|null} */
    getProjectUrl() {
      return store.get(KEYS.projectUrl) ?? null;
    },

    /**
     * @param {string} projectUrl
     * @returns {string} normalized URL
     */
    setProjectUrl(projectUrl) {
      const value = String(projectUrl ?? '').trim();
      if (!value) {
        throw new Error('Supabase project URL is required');
      }
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(
          'Supabase project URL must be a valid http(s) URL (https://xxxx.supabase.co)',
        );
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(
          'Supabase project URL must be a valid http(s) URL (https://xxxx.supabase.co)',
        );
      }
      store.set(KEYS.projectUrl, value.replace(/\/+$/, ''));
      return store.get(KEYS.projectUrl);
    },

    /** @returns {{iv: string, authTag: string, ciphertext: string}|null} */
    getServiceKeyBlob() {
      return store.get(KEYS.serviceKeyBlob) ?? null;
    },

    /** @returns {{iv: string, authTag: string, ciphertext: string}|null} */
    getDatabaseUrlBlob() {
      return store.get(KEYS.databaseUrlBlob) ?? null;
    },

    /**
     * Persist both secret blobs (ciphertext only).
     * @param {{serviceKeyBlob: object, databaseUrlBlob: object}} blobs
     */
    setSecretBlobs({ serviceKeyBlob, databaseUrlBlob } = {}) {
      const missing = [];
      if (!serviceKeyBlob?.ciphertext) missing.push('serviceKeyBlob');
      if (!databaseUrlBlob?.ciphertext) missing.push('databaseUrlBlob');
      if (missing.length > 0) {
        throw new Error(
          `Missing Supabase secrets: ${missing.join(', ')} are required`,
        );
      }
      store.set(KEYS.serviceKeyBlob, serviceKeyBlob);
      store.set(KEYS.databaseUrlBlob, databaseUrlBlob);
    },

    clearSecrets() {
      store.delete(KEYS.serviceKeyBlob);
      store.delete(KEYS.databaseUrlBlob);
    },

    /** Persist the last sync outcome (non-sensitive diagnostics). */
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
        hasCredentials: Boolean(store.get(KEYS.projectUrl)),
        connected: Boolean(
          store.get(KEYS.serviceKeyBlob) && store.get(KEYS.databaseUrlBlob),
        ),
      };
    },
  };
}
