import Store from 'electron-store';

/**
 * Supabase config store (spec S1, amended A1): holds the user-entered
 * project URL in plain form (not secret) plus an encrypted blob for
 * the database connection string. The connection string is encrypted
 * with the vault session key (encryptSessionData) before it reaches
 * disk. No service-role key: the app talks to Postgres directly.
 */

const KEYS = {
  projectUrl: 'supabase.projectUrl',
  databaseUrlBlob: 'supabase.databaseUrlBlob',
  /** Legacy only — written by older builds, cleared on next connect. */
  serviceKeyBlob: 'supabase.serviceKeyBlob',
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
    getDatabaseUrlBlob() {
      return store.get(KEYS.databaseUrlBlob) ?? null;
    },

    /**
     * Persist the encrypted database connection string (ciphertext only).
     * @param {{databaseUrlBlob: object}} blobs
     */
    setSecretBlobs({ databaseUrlBlob } = {}) {
      if (!databaseUrlBlob?.ciphertext) {
        throw new Error(
          'Missing Supabase secrets: databaseUrlBlob is required',
        );
      }
      store.set(KEYS.databaseUrlBlob, databaseUrlBlob);
      // Drop any legacy service-key blob from older builds (A1).
      store.delete(KEYS.serviceKeyBlob);
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
        connected: Boolean(store.get(KEYS.databaseUrlBlob)),
      };
    },
  };
}
