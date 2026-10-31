import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createS3Config } from './s3-config.js';

const settings = {
  endpoint: 'https://s3.eu-central-003.backblazeb2.com',
  region: 'eu-central-003',
  bucket: 'passbox-vaults',
  accessKeyId: 'key-id-123',
};

const secretBlob = {
  iv: 'aXY=',
  authTag: 'dGFn',
  ciphertext: 'ZW5jcnlwdGVkLXNlY3JldA==',
};

let cwd;
let config;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'passbox-s3config-'));
  config = createS3Config(cwd);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('s3-config settings (S1/S2: BYO, non-sensitive fields)', () => {
  it('stores the four non-secret fields and reports them', () => {
    config.setCredentials(settings);
    expect(config.getCredentials()).toEqual(settings);
  });

  it('rejects incomplete settings', () => {
    expect(() => config.setCredentials({ ...settings, bucket: '' })).toThrow(
      /required/,
    );
    expect(() =>
      config.setCredentials({ endpoint: settings.endpoint }),
    ).toThrow(/required/);
    expect(config.getCredentials()).toBeNull();
  });

  it('reports no credentials before anything is stored', () => {
    expect(config.getCredentials()).toBeNull();
    expect(config.getStatus()).toEqual({
      hasCredentials: false,
      connected: false,
    });
  });
});

describe('s3-config secret blob (S2: encrypted at rest)', () => {
  it('persists the encrypted secret blob and reports connected', () => {
    config.setCredentials(settings);
    expect(config.getStatus().connected).toBe(false);
    config.setTokenBlob(secretBlob);
    expect(config.getTokenBlob()).toEqual(secretBlob);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: true,
    });
  });

  it('clears only the secret, keeping settings for reconnect', () => {
    config.setCredentials(settings);
    config.setTokenBlob(secretBlob);
    config.clearToken();
    expect(config.getTokenBlob()).toBeNull();
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });
});

describe('s3-config sync state (S11: non-sensitive diagnostics)', () => {
  it('records and returns the last sync outcome', () => {
    expect(config.getLastSync()).toBeNull();
    config.recordSync(false, 'sync timed out');
    const last = config.getLastSync();
    expect(last.ok).toBe(false);
    expect(last.error).toBe('sync timed out');
    expect(typeof last.at).toBe('string');
    config.recordSync(true);
    expect(config.getLastSync().ok).toBe(true);
    expect(config.getLastSync().error).toBeUndefined();
  });
});
