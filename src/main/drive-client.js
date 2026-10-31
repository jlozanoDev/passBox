import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

/**
 * Real Google Drive v3 client factory (spec S11: googleapis SDK).
 * Resolves the BYO credentials and decrypts the refresh token with the
 * vault session key; google-auth-library refreshes access tokens
 * transparently. Only called at sync time — never in unit tests,
 * which inject a mock client into drive-files instead.
 *
 * @param {object} config drive-config instance
 * @param {object} vaultStore vault-store instance (must be unlocked)
 */
export function createDriveClient(config, vaultStore) {
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

  const { refreshToken } = vaultStore.decryptSessionData(blob);
  const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth });
}
