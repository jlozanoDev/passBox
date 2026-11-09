import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseConfig } from './supabase-config.js';

const settings = {
  projectUrl: 'https://abcdefgh.supabase.co',
};

const secrets = {
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service-role',
  databaseUrl:
    'postgresql://postgres.abcdefgh:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
};

const keyBlob = {
  iv: 'aXY=',
  authTag: 'dGFn',
  ciphertext: 'ZW5jcnlwdGVkLXNlY3JldA==',
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
  it('stores projectUrl; connected stays false until secrets exist', () => {
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

describe('supabase-config secrets (S1: encrypted at rest)', () => {
  beforeEach(() => {
    config.setProjectUrl(settings.projectUrl);
  });

  it('persists encrypted service key and database URL blobs', () => {
    expect(config.getStatus().connected).toBe(false);
    config.setSecretBlobs({ serviceKeyBlob: keyBlob, databaseUrlBlob: dbBlob });
    expect(config.getServiceKeyBlob()).toEqual(keyBlob);
    expect(config.getDatabaseUrlBlob()).toEqual(dbBlob);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: true,
    });
  });

  it('never writes plaintext secrets into the electron-store file', () => {
    config.setSecretBlobs({ serviceKeyBlob: keyBlob, databaseUrlBlob: dbBlob });
    const raw = readFileSync(join(cwd, 'passbox-config.json'), 'utf8');
    expect(raw).not.toContain(secrets.serviceKey);
    expect(raw).not.toContain('password@aws-0');
    expect(raw).not.toContain(settings.projectUrl + '/service');
  });

  it('clears only the secrets, keeping projectUrl for reconnect', () => {
    config.setSecretBlobs({ serviceKeyBlob: keyBlob, databaseUrlBlob: dbBlob });
    config.clearSecrets();
    expect(config.getServiceKeyBlob()).toBeNull();
    expect(config.getDatabaseUrlBlob()).toBeNull();
    expect(config.getProjectUrl()).toBe(settings.projectUrl);
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });

  it('requires both blobs when setting secrets', () => {
    expect(() => config.setSecretBlobs({ serviceKeyBlob: keyBlob })).toThrow(
      /required/i,
    );
    expect(config.getStatus().connected).toBe(false);
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
