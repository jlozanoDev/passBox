import Store from 'electron-store';

/**
 * Drive config store (spec S5 bring-your-own credentials, Log L5):
 * holds the user-entered OAuth client credentials and the encrypted
 * token blob. Only ciphertext and the user's own client id/secret
 * live here — the refresh token itself is encrypted with the vault
 * session key before it ever reaches disk.
 */

const KEYS = {
  clientId: 'google.clientId',
  clientSecret: 'google.clientSecret',
  tokenBlob: 'google.tokenBlob',
};

/**
 * @param {string} [cwd] test-only override for the config directory
 */
export function createDriveConfig(cwd) {
  const store = new Store(
    cwd ? { cwd, name: 'passbox-config' } : { name: 'passbox-config' },
  );

  return {
    getCredentials() {
      const clientId = store.get(KEYS.clientId);
      const clientSecret = store.get(KEYS.clientSecret);
      if (!clientId || !clientSecret) return null;
      return { clientId, clientSecret };
    },

    setCredentials({ clientId, clientSecret }) {
      if (!clientId || !clientSecret) {
        throw new Error('clientId and clientSecret are required');
      }
      store.set(KEYS.clientId, clientId);
      store.set(KEYS.clientSecret, clientSecret);
    },

    getTokenBlob() {
      return store.get(KEYS.tokenBlob) ?? null;
    },

    /** @param {{iv: string, authTag: string, ciphertext: string}} blob */
    setTokenBlob(blob) {
      store.set(KEYS.tokenBlob, blob);
    },

    clearToken() {
      store.delete(KEYS.tokenBlob);
    },

    getStatus() {
      return {
        hasCredentials:
          store.has(KEYS.clientId) && store.has(KEYS.clientSecret),
        connected: Boolean(store.get(KEYS.tokenBlob)),
      };
    },
  };
}
