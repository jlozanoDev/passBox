import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVaultStore, VAULT_FILENAME } from './vault-store.js';

let baseDir;
let store;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'passbox-vault-'));
  store = createVaultStore(baseDir);
});

afterEach(() => {
  store.lock();
  rmSync(baseDir, { recursive: true, force: true });
});

describe('vault-store', () => {
  it('starts locked and without a vault file', () => {
    expect(store.status()).toEqual({ exists: false, unlocked: false });
  });

  it('creates an empty vault per the v1 schema (S1/S2/S10)', () => {
    const payload = store.create('master-password');

    expect(payload.version).toBe('1.0.0');
    expect(payload.items).toEqual([]);
    expect(typeof payload.salt).toBe('string');
    expect(typeof payload.updatedAt).toBe('string');
    expect(store.status()).toEqual({ exists: true, unlocked: true });

    const onDisk = JSON.parse(
      readFileSync(join(baseDir, VAULT_FILENAME), 'utf8'),
    );
    expect(onDisk).toHaveProperty('iv');
    expect(onDisk).toHaveProperty('authTag');
    expect(onDisk).toHaveProperty('ciphertext');
    expect(onDisk).toHaveProperty('salt');
    expect(JSON.stringify(onDisk)).not.toContain('master-password');
  });

  it('refuses to create a second vault over an existing one', () => {
    store.create('master-password');
    expect(() => store.create('another-password')).toThrow();
  });

  it('locks and unlocks with the same password, rejects a wrong one', () => {
    store.create('master-password');
    store.lock();
    expect(store.status().unlocked).toBe(false);

    expect(() => store.unlock('wrong-password')).toThrow();
    const payload = store.unlock('master-password');
    expect(payload.items).toEqual([]);
    expect(store.status().unlocked).toBe(true);
  });

  it('persists mutations through save and reloads them after relock (S2/S4)', () => {
    store.create('master-password');
    const payload = store.unlock('master-password');
    payload.items.push({
      id: 'item-1',
      title: 'Stripe Production API Key',
      category: 'api_token',
      username: 'admin@project.com',
      secret: 'sk_live_51M...',
      notes: 'Usar solo en entornos productivos de pasarela de pagos.',
      createdAt: '2026-10-30T20:00:00.000Z',
      updatedAt: '2026-10-30T20:00:00.000Z',
    });
    store.save(payload);
    store.lock();

    const reopened = store.unlock('master-password');
    expect(reopened.items).toHaveLength(1);
    expect(reopened.items[0].title).toBe('Stripe Production API Key');
  });

  it('refuses to save or unlock operations while locked', () => {
    expect(() => store.save({ items: [] })).toThrow();
    expect(() => store.unlock('x')).toThrow();
  });

  it('clears the in-memory key on lock (RNF-04)', () => {
    store.create('master-password');
    store.lock();
    expect(store.status().unlocked).toBe(false);
    // A corrupt file cannot be silently "unlocked" with a cleared key state.
    const vaultPath = join(baseDir, VAULT_FILENAME);
    writeFileSync(vaultPath, 'not-json');
    expect(() => store.unlock('master-password')).toThrow();
  });

  it('encrypts and decrypts auxiliary blobs with the session key (S5 token)', () => {
    store.create('master-password');
    const blob = store.encryptSessionData({ refreshToken: 'refresh-token-1' });

    expect(blob).toHaveProperty('iv');
    expect(blob).toHaveProperty('authTag');
    expect(blob).toHaveProperty('ciphertext');
    expect(JSON.stringify(blob)).not.toContain('refresh-token-1');

    const opened = store.decryptSessionData(blob);
    expect(opened).toEqual({ refreshToken: 'refresh-token-1' });
  });

  it('refuses session-blob crypto while locked', () => {
    expect(() => store.encryptSessionData({ a: 1 })).toThrow();
    expect(() =>
      store.decryptSessionData({ iv: 'x', authTag: 'y', ciphertext: 'z' }),
    ).toThrow();
  });
});
