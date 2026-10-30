import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDriveConfig } from './drive-config.js';

let cwd;
let config;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'passbox-config-'));
  config = createDriveConfig(cwd);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('drive-config', () => {
  it('starts with no credentials and no token (BYO first-connect, S5)', () => {
    expect(config.getStatus()).toEqual({
      hasCredentials: false,
      connected: false,
    });
  });

  it('stores user-provided OAuth credentials and reports them (S5)', () => {
    config.setCredentials({
      clientId: 'user-client-id.apps.googleusercontent.com',
      clientSecret: 'user-secret',
    });

    expect(config.getCredentials()).toEqual({
      clientId: 'user-client-id.apps.googleusercontent.com',
      clientSecret: 'user-secret',
    });
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });

  it('persists the encrypted token blob and reports connected state', () => {
    config.setCredentials({ clientId: 'id', clientSecret: 'secret' });
    config.setTokenBlob({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: 'Y2lwaGVy',
    });

    expect(config.getTokenBlob()).toEqual({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: 'Y2lwaGVy',
    });
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: true,
    });
  });

  it('disconnect clears only the token, keeping credentials for reconnect', () => {
    config.setCredentials({ clientId: 'id', clientSecret: 'secret' });
    config.setTokenBlob({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: 'Y2lwaGVy',
    });

    config.clearToken();

    expect(config.getTokenBlob()).toBeNull();
    expect(config.getCredentials()).not.toBeNull();
  });

  it('rejects empty credentials', () => {
    expect(() =>
      config.setCredentials({ clientId: '', clientSecret: 'x' }),
    ).toThrow();
    expect(() =>
      config.setCredentials({ clientId: 'x', clientSecret: '' }),
    ).toThrow();
  });
});
