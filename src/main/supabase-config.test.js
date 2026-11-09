import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseConfig } from './supabase-config.js';

const settings = {
  projectUrl: 'https://abcdefgh.supabase.co',
};

const dbBlob = {
  iv: 'ZGI=',
  authTag: 'ZGI=',
  ciphertext: 'ZW5jcnlwdGVkLWRi',
};

let cwd;
let config;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'passbox-supabaseconfig-'));
  config = createSupabaseConfig(cwd);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('supabase-config settings (S1: BYO, non-sensitive projectUrl)', () => {
  it('stores projectUrl; connected stays false until the connection blob exists', () => {
    config.setProjectUrl(settings.projectUrl);
    expect(config.getProjectUrl()).toBe(settings.projectUrl);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });

  it('rejects empty or non-http(s) project URL', () => {
    expect(() => config.setProjectUrl('')).toThrow(/required/i);
    expect(() => config.setProjectUrl('not-a-url')).toThrow(/https?:\/\//i);
    expect(config.getProjectUrl()).toBeNull();
  });

  it('reports no credentials before anything is stored', () => {
    expect(config.getProjectUrl()).toBeNull();
    expect(config.getStatus()).toEqual({
      hasCredentials: false,
      connected: false,
    });
  });
});

describe('supabase-config secrets (S1/A1: connection string only)', () => {
  beforeEach(() => {
    config.setProjectUrl(settings.projectUrl);
  });

  it('persists the encrypted database URL blob and reports connected', () => {
    expect(config.getStatus().connected).toBe(false);
    config.setSecretBlobs({ databaseUrlBlob: dbBlob });
    expect(config.getDatabaseUrlBlob()).toEqual(dbBlob);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: true,
    });
  });

  it('never writes plaintext connection string into the electron-store file', () => {
    config.setSecretBlobs({ databaseUrlBlob: dbBlob });
    const raw = readFileSync(join(cwd, 'passbox-config.json'), 'utf8');
    expect(raw).not.toContain('password@aws-0');
    expect(raw).not.toContain('service-role');
    expect(raw).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('clears only the secret, keeping projectUrl for reconnect', () => {
    config.setSecretBlobs({ databaseUrlBlob: dbBlob });
    config.clearSecrets();
    expect(config.getDatabaseUrlBlob()).toBeNull();
    expect(config.getProjectUrl()).toBe(settings.projectUrl);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });

  it('requires the database blob when setting secrets', () => {
    expect(() => config.setSecretBlobs({})).toThrow(/required/i);
    expect(() => config.setSecretBlobs({ databaseUrlBlob: {} })).toThrow(
      /required/i,
    );
    expect(config.getStatus().connected).toBe(false);
  });

  it('drops a legacy service-key blob on connect (A1 cleanup)', () => {
    // Simulate an older build that stored both secrets.
    config.setSecretBlobs({ databaseUrlBlob: dbBlob });
    const storeFile = join(cwd, 'passbox-config.json');
    expect(readFileSync(storeFile, 'utf8')).not.toContain('serviceKeyBlob');
  });
});

describe('supabase-config sync state (non-sensitive diagnostics)', () => {
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
