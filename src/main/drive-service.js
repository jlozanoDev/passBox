import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { buildAuthUrl, startLoopbackServer } from './oauth.js';

/**
 * Drive connection service (spec S5, Log L5 bring-your-own): the user
 * enters their own OAuth client credentials on first connect; this
 * module runs the loopback flow, exchanges the code, encrypts the
 * token with the vault session key and persists only ciphertext.
 *
 * @param {{getCredentials: Function, setTokenBlob: Function,
 *          getTokenBlob: Function, clearToken: Function,
 *          getStatus: Function}} config
 * @param {{encryptSessionData: Function, decryptSessionData: Function,
 *          status: Function}} vaultStore
 * @param {(url: string) => Promise<void>} openExternal shell.openExternal
 */
export function createDriveService(config, vaultStore, openExternal) {
  return {
    status() {
      return config.getStatus();
    },

    setCredentials(credentials) {
      config.setCredentials(credentials);
    },

    async connect() {
      const credentials = config.getCredentials();
      if (!credentials) {
        throw new Error('No Google OAuth credentials configured');
      }
      if (!vaultStore.status().unlocked) {
        throw new Error('Vault must be unlocked to connect Drive');
      }

      const client = new OAuth2Client(
        credentials.clientId,
        credentials.clientSecret,
      );
      const state = randomBytes(16).toString('hex');
      const server = await startLoopbackServer();

      try {
        client.redirectUri = server.redirectUri;
        const authUrl = buildAuthUrl(client, state);
        await openExternal(authUrl);

        const code = await server.waitForCallback(state);
        const { tokens } = await client.getToken(code);

        if (!tokens.refresh_token) {
          throw new Error('Google did not return a refresh token');
        }

        const blob = vaultStore.encryptSessionData({
          refreshToken: tokens.refresh_token,
        });
        config.setTokenBlob(blob);
        return { connected: true };
      } finally {
        await server.close();
      }
    },

    disconnect() {
      config.clearToken();
    },
  };
}
