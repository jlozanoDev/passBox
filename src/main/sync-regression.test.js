import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncService } from './sync.js';
import { createVaultStore } from './vault-store.js';
import { createVault } from '../crypto/vault.js';

const PW = 'master-password';
let baseDir;
let store;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'passbox-sync-reg-'));
  store = createVaultStore(baseDir);
});

afterEach(() => {
  store.lock();
  rmSync(baseDir, { recursive: true, force: true });
});

function remoteEnvelopeWithOtherSalt(updatedAt, title) {
  return createVault(
    {
      version: '1.0.0',
      salt: Buffer.from('other-salt').toString('base64'),
      updatedAt,
      items: [{ id: 'remote-1', title }],
    },
    PW,
  );
}

function makeConnectedConfig() {
  return {
    getStatus: () => ({ hasCredentials: true, connected: true }),
    recordSync: vi.fn(),
    getTokenBlob: () => null,
    setTokenBlob: vi.fn(),
  };
}

describe('S3/RF-03 sync regression — the local vault is never clobbered', () => {
  it('does not replace a newer local vault with an older remote of another salt', async () => {
    const payload = store.create(PW);
    const saved = store.save({
      ...payload,
      items: [{ id: 'local-1', title: 'LOCAL-ONLY-SECRET' }],
    });
    const remote = remoteEnvelopeWithOtherSalt(
      '2020-01-01T00:00:00.000Z',
      'REMOTE-OLD-SECRET',
    );
    const driveFiles = {
      download: vi.fn(async () => remote),
      upload: vi.fn(async () => ({ fileId: 'f1', created: false })),
    };
    const sync = createSyncService({
      vaultStore: store,
      driveFiles,
      config: makeConnectedConfig(),
    });

    const result = await sync.open(saved, PW);

    // The remote is OLDER: the newer local vault must survive.
    expect(result.payload.items.map((i) => i.title)).toEqual([
      'LOCAL-ONLY-SECRET',
    ]);
    const onDisk = store.decryptWithSession(store.readEnvelope());
    expect(onDisk.items.map((i) => i.title)).toEqual(['LOCAL-ONLY-SECRET']);
  });

  it('adoptRemote keeps the session usable when the atomic write fails', () => {
    const payload = store.create(PW);
    const remote = remoteEnvelopeWithOtherSalt(
      '2026-01-03T00:00:00.000Z',
      'From cloud',
    );
    // Make the tmp target unusable so the atomic write fails.
    mkdirSync(join(baseDir, 'passbox.vault.tmp'));

    expect(() => store.adoptRemote(remote, PW)).toThrow();

    // The session must still match the file on disk.
    expect(store.decryptWithSession(store.readEnvelope())).toEqual(payload);
  });

  it('adopting a remote vault does not orphan the encrypted Drive token', async () => {
    const payload = store.create(PW);
    const saved = store.save({
      ...payload,
      updatedAt: '2020-01-01T00:00:00.000Z',
      items: [{ id: 'local-1', title: 'Local' }],
    });
    const config = makeConnectedConfig();
    let tokenBlob = store.encryptSessionData({ refreshToken: 'refresh-1' });
    config.getTokenBlob = () => tokenBlob;
    config.setTokenBlob = (b) => {
      tokenBlob = b;
    };
    // save() stamps updatedAt=now, so the remote must be in the future
    // to exercise the newer-remote adoption path.
    const remote = remoteEnvelopeWithOtherSalt(
      '2099-01-03T00:00:00.000Z',
      'From cloud',
    );
    const driveFiles = {
      download: vi.fn(async () => remote),
      upload: vi.fn(async () => ({ fileId: 'f1', created: false })),
    };
    const sync = createSyncService({ vaultStore: store, driveFiles, config });

    const result = await sync.open(saved, PW);

    expect(result.action).toBe('pulled');
    // The stored Drive session must still be decryptable after adoption.
    expect(() => store.decryptSessionData(tokenBlob)).not.toThrow();
    expect(store.decryptSessionData(tokenBlob)).toEqual({
      refreshToken: 'refresh-1',
    });
  });

  it('uploadAfterSave never rejects when the config store fails', async () => {
    const payload = store.create(PW);
    const config = {
      getStatus: () => {
        throw new Error('electron-store read failed');
      },
      recordSync: vi.fn(),
      getTokenBlob: () => null,
      setTokenBlob: vi.fn(),
    };
    const driveFiles = {
      download: vi.fn(async () => null),
      upload: vi.fn(async () => ({ fileId: 'f1', created: false })),
    };
    const sync = createSyncService({ vaultStore: store, driveFiles, config });

    await expect(sync.uploadAfterSave(payload)).resolves.toBeDefined();
  });
});
