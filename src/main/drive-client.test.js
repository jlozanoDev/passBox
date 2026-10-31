import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from './drive-client.js';

const blob = { iv: 'aXY=', authTag: 'dGFn', ciphertext: 'Y2lwaGVy' };

function makeConfig(overrides = {}) {
  return {
    getCredentials: vi.fn(() => ({ clientId: 'cid', clientSecret: 'csec' })),
    getTokenBlob: vi.fn(() => blob),
    clearToken: vi.fn(),
    ...overrides,
  };
}

function makeVaultStore(overrides = {}) {
  return {
    status: vi.fn(() => ({ exists: true, unlocked: true })),
    decryptSessionData: vi.fn(() => ({ refreshToken: 'refresh-token-1' })),
    ...overrides,
  };
}

describe('createAuthClient gating (S5 token handling)', () => {
  it('throws before touching the token when credentials are missing', () => {
    const config = makeConfig({ getCredentials: vi.fn(() => null) });
    const vaultStore = makeVaultStore();

    expect(() => createAuthClient(config, vaultStore)).toThrow(
      /No Google OAuth credentials/,
    );
    expect(vaultStore.decryptSessionData).not.toHaveBeenCalled();
  });

  it('throws before touching the token when Drive is not connected', () => {
    const config = makeConfig({ getTokenBlob: vi.fn(() => null) });
    const vaultStore = makeVaultStore();

    expect(() => createAuthClient(config, vaultStore)).toThrow(/not connected/);
    expect(vaultStore.decryptSessionData).not.toHaveBeenCalled();
  });

  it('refuses to decrypt while the vault is locked', () => {
    const config = makeConfig();
    const vaultStore = makeVaultStore({
      status: vi.fn(() => ({ exists: true, unlocked: false })),
    });

    expect(() => createAuthClient(config, vaultStore)).toThrow(
      /unlocked to sync/,
    );
    expect(vaultStore.decryptSessionData).not.toHaveBeenCalled();
  });

  it('returns an authenticated client carrying the decrypted refresh token', () => {
    const config = makeConfig();
    const vaultStore = makeVaultStore();

    const drive = createAuthClient(config, vaultStore);

    expect(drive).toBeTruthy();
    expect(drive.credentials.refresh_token).toBe('refresh-token-1');
  });

  it('clears the token and reports reconnection when decryption fails', () => {
    const config = makeConfig();
    const vaultStore = makeVaultStore({
      decryptSessionData: vi.fn(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      }),
    });

    expect(() => createAuthClient(config, vaultStore)).toThrow(
      /reconnect Google Drive/,
    );
    expect(config.clearToken).toHaveBeenCalledTimes(1);
  });
});
