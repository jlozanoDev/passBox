import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVaultStore, VAULT_FILENAME } from './vault-store.js';
import { createVault } from '../crypto/vault.js';

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

  it('readEnvelope returns the raw ciphertext from disk, never plaintext', () => {
    expect(() => store.readEnvelope()).toThrow();

    store.create('master-password');
    const envelope = store.readEnvelope();

    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('authTag');
    expect(envelope).toHaveProperty('ciphertext');
    expect(envelope).toHaveProperty('salt');
    expect(JSON.stringify(envelope)).not.toContain('master-password');
  });

  it('decryptWithSession decrypts vault envelopes with the session key', () => {
    const payload = store.create('master-password');

    expect(store.decryptWithSession(store.readEnvelope())).toEqual(payload);
  });

  it('decryptWithSession refuses while locked', () => {
    store.create('master-password');
    const envelope = store.readEnvelope();
    store.lock();

    expect(() => store.decryptWithSession(envelope)).toThrow(/locked/);
  });

  it('replaceEnvelope overwrites the file without leaving temp residue', async () => {
    const { readdirSync } = await import('node:fs');
    store.create('master-password');
    const payloadB = {
      version: '1.0.0',
      salt: Buffer.from('salt-b').toString('base64'),
      updatedAt: '2026-01-03T00:00:00.000Z',
      items: [{ id: 'remote-1', title: 'From cloud' }],
    };
    const envelopeB = createVault(payloadB, 'master-password');

    store.replaceEnvelope(envelopeB);

    expect(store.readEnvelope()).toEqual(envelopeB);
    expect(readdirSync(baseDir).some((f) => f.endsWith('.tmp'))).toBe(false);

    // The replaced file survives a full lock/unlock cycle (S2 integrity).
    store.lock();
    expect(store.unlock('master-password')).toEqual(payloadB);
  });

  it('adoptRemote swaps the session to a same-password envelope from another device', () => {
    store.create('local-password');
    const remotePayload = {
      version: '1.0.0',
      salt: Buffer.from('cmVtb3RlLXNhbHQ').toString('base64'),
      updatedAt: '2026-01-03T00:00:00.000Z',
      items: [{ id: 'remote-1', title: 'From cloud' }],
    };
    const remoteEnvelope = createVault(remotePayload, 'local-password');

    // Different salt: session key from the local vault cannot read it.
    expect(() => store.decryptWithSession(remoteEnvelope)).toThrow();

    const returned = store.adoptRemote(remoteEnvelope, 'local-password');

    expect(returned).toEqual(remotePayload);
    expect(store.decryptWithSession(remoteEnvelope)).toEqual(remotePayload);
    expect(store.readEnvelope()).toEqual(remoteEnvelope);
  });

  it('adoptRemote rejects a wrong password without corrupting the session', () => {
    const payload = store.create('local-password');
    const remoteEnvelope = createVault(
      { ...payload, updatedAt: '2026-01-03T00:00:00.000Z' },
      'other-password',
    );

    expect(() => store.adoptRemote(remoteEnvelope, 'wrong-password')).toThrow();

    // Session and file remain on the original lineage.
    expect(store.decryptWithSession(store.readEnvelope())).toEqual(payload);
  });
});
