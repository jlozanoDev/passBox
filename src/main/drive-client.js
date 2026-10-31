import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

/**
 * Real Google Drive v3 client factory (spec S11: googleapis SDK).
 * Resolves the BYO credentials and decrypts the refresh token with the
 * vault session key; google-auth-library refreshes access tokens
 * transparently. Token resolution is separated from SDK construction
 * so its gating is unit-testable without network access.
 *
 * @param {object} config drive-config instance
 * @param {object} vaultStore vault-store instance (must be unlocked)
 * @returns {OAuth2Client}
 */
export function createAuthClient(config, vaultStore) {
  const credentials = config.getCredentials();
  if (!credentials) {
    throw new Error('No Google OAuth credentials configured');
  }
  const blob = config.getTokenBlob();
  if (!blob) {
    throw new Error('Google Drive is not connected');
  }
  if (!vaultStore.status().unlocked) {
    throw new Error('Vault must be unlocked to sync');
  }

  let refreshToken;
  try {
    ({ refreshToken } = vaultStore.decryptSessionData(blob));
  } catch {
    // GCM auth failure here is permanent (wrong vault key or corrupt
    // blob) — drop the unreadable session so the user can reconnect.
    config.clearToken();
    throw new Error('Drive session expired — reconnect Google Drive');
  }

  const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

/**
 * @param {object} config drive-config instance
 * @param {object} vaultStore vault-store instance (must be unlocked)
 */
export function createDriveClient(config, vaultStore) {
  return google.drive({
    version: 'v3',
    auth: createAuthClient(config, vaultStore),
  });
}
