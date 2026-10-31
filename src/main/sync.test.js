import { describe, expect, it, vi } from 'vitest';
import { SYNC_TIMEOUT_MS, createSyncService } from './sync.js';

const localEnvelope = {
  salt: 'TE9DQUw=',
  iv: 'aXY=',
  authTag: 'dGFn',
  ciphertext: 'bG9jYWw=',
};

const localPayload = {
  version: '1.0.0',
  salt: 'TE9DQUw=',
  updatedAt: '2026-01-02T00:00:00.000Z',
  items: [{ id: 'local-1', title: 'Local secret' }],
};

function makeDeps({ connected = true, remote = null, tokenBlob = null } = {}) {
  const config = {
    getStatus: vi.fn(() => ({ hasCredentials: true, connected })),
    recordSync: vi.fn(),
    getTokenBlob: vi.fn(() => tokenBlob),
    setTokenBlob: vi.fn(),
  };
  const vaultStore = {
    readEnvelope: vi.fn(() => localEnvelope),
    decryptWithSession: vi.fn(() => {
      throw new Error('auth failure');
    }),
    decryptSessionData: vi.fn(() => ({ refreshToken: 'refresh-1' })),
    encryptSessionData: vi.fn((data) => ({
      iv: 'bmV3',
      authTag: 'dGFn',
      ciphertext: JSON.stringify(data),
    })),
    replaceEnvelope: vi.fn(),
    previewRemoteWithPassword: vi.fn(() => {
      throw new Error('bad password');
    }),
    adoptRemote: vi.fn(() => {
      throw new Error('bad password');
    }),
  };
  const driveFiles = {
    download: vi.fn(async () => remote),
    upload: vi.fn(async () => ({ fileId: 'f1', created: false })),
  };
  return { config, vaultStore, driveFiles };
}

describe('syncService.open (RF-03: check cloud on open)', () => {
  it('skips entirely when Drive is not connected', async () => {
    const deps = makeDeps({ connected: false });
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result).toEqual({ payload: localPayload, action: 'skipped' });
    expect(deps.driveFiles.download).not.toHaveBeenCalled();
    expect(deps.vaultStore.adoptRemote).not.toHaveBeenCalled();
  });

  it('seeds the cloud when no remote vault exists yet', async () => {
    const deps = makeDeps({ remote: null });
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('seeded');
    expect(result.payload).toBe(localPayload);
    expect(deps.driveFiles.upload).toHaveBeenCalledWith(localEnvelope);
    expect(deps.config.recordSync).toHaveBeenCalledWith(true);
  });

  it('pulls a newer remote vault through the session key', async () => {
    const remotePayload = {
      ...localPayload,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const remoteEnvelope = { ...localEnvelope, ciphertext: 'cmVtb3Rl' };
    const deps = makeDeps({ remote: remoteEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(remotePayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('pulled');
    expect(result.payload).toBe(remotePayload);
    expect(deps.vaultStore.replaceEnvelope).toHaveBeenCalledWith(
      remoteEnvelope,
    );
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
  });

  it('adopts a NEWER different-salt remote with the same password (rekey path)', async () => {
    const remotePayload = {
      ...localPayload,
      salt: 'RE1PVEU=',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const remoteEnvelope = { ...localEnvelope, salt: 'RE1PVEU=' };
    const deps = makeDeps({ remote: remoteEnvelope });
    deps.vaultStore.previewRemoteWithPassword.mockReturnValue(remotePayload);
    deps.vaultStore.adoptRemote.mockReturnValue(remotePayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('pulled');
    expect(result.payload).toBe(remotePayload);
    expect(deps.vaultStore.adoptRemote).toHaveBeenCalledWith(
      remoteEnvelope,
      'master-pw',
    );
    // No session-key change on this path, so no token migration needed.
    expect(deps.config.setTokenBlob).not.toHaveBeenCalled();
  });

  it('never adopts an OLDER different-salt remote (B1: local must survive)', async () => {
    const olderPayload = {
      ...localPayload,
      salt: 'T1RIRVI=',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const remoteEnvelope = { ...localEnvelope, salt: 'T1RIRVI=' };
    const deps = makeDeps({ remote: remoteEnvelope });
    deps.vaultStore.previewRemoteWithPassword.mockReturnValue(olderPayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('incompatible');
    expect(result.payload).toBe(localPayload);
    expect(deps.vaultStore.adoptRemote).not.toHaveBeenCalled();
    expect(deps.vaultStore.replaceEnvelope).not.toHaveBeenCalled();
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
  });

  it('refuses a remote vault created with a different master password', async () => {
    const remoteEnvelope = { ...localEnvelope, salt: 'T1RIRVI=' };
    const deps = makeDeps({ remote: remoteEnvelope });
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('incompatible');
    expect(result.payload).toBe(localPayload);
    expect(deps.vaultStore.adoptRemote).not.toHaveBeenCalled();
    expect(deps.vaultStore.replaceEnvelope).not.toHaveBeenCalled();
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
  });

  it('carries the Drive token across the key swap when adopting (B3)', async () => {
    const remotePayload = {
      ...localPayload,
      salt: 'RE1PVEU=',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const remoteEnvelope = { ...localEnvelope, salt: 'RE1PVEU=' };
    const deps = makeDeps({
      remote: remoteEnvelope,
      tokenBlob: { iv: 'aXY=', authTag: 'dGFn', ciphertext: 'eA==' },
    });
    deps.vaultStore.previewRemoteWithPassword.mockReturnValue(remotePayload);
    deps.vaultStore.adoptRemote.mockReturnValue(remotePayload);
    const sync = createSyncService(deps);

    await sync.open(localPayload, 'master-pw');

    // Token decrypted with the OLD key, re-encrypted with the NEW one.
    expect(deps.vaultStore.decryptSessionData).toHaveBeenCalledWith({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: 'eA==',
    });
    expect(deps.config.setTokenBlob).toHaveBeenCalledWith(
      deps.vaultStore.encryptSessionData.mock.results[0].value,
    );
  });

  it('pushes when the local vault is newer than the remote', async () => {
    const remotePayload = {
      ...localPayload,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const deps = makeDeps({ remote: localEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(remotePayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('pushed');
    expect(result.payload).toBe(localPayload);
    expect(deps.driveFiles.upload).toHaveBeenCalledWith(localEnvelope);
  });

  it('does nothing when both vaults are identical in time', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(localPayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('uptodate');
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
    expect(deps.vaultStore.replaceEnvelope).not.toHaveBeenCalled();
    expect(deps.config.recordSync).toHaveBeenCalledWith(true);
  });

  it('stays local when the cloud is unreachable (local-first)', async () => {
    const deps = makeDeps();
    deps.driveFiles.download.mockRejectedValue(new Error('network down'));
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('offline');
    expect(result.payload).toBe(localPayload);
    expect(deps.config.recordSync).toHaveBeenCalledWith(false, 'network down');
  });

  it('never blocks unlock: a hung cloud operation times out (A1)', async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps();
      deps.driveFiles.download.mockReturnValue(new Promise(() => {}));
      const sync = createSyncService(deps);

      const pending = sync.open(localPayload, 'master-pw');
      await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS + 1);
      const result = await pending;

      expect(result.action).toBe('offline');
      expect(result.error).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never rejects when the config store itself is broken (A2)', async () => {
    const deps = makeDeps();
    deps.config.getStatus.mockImplementation(() => {
      throw new Error('electron-store read failed');
    });
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('offline');
    expect(result.payload).toBe(localPayload);
  });
});

describe('syncService.uploadAfterSave (RF-03: auto upload on mutation)', () => {
  it('does nothing when Drive is not connected', async () => {
    const deps = makeDeps({ connected: false });
    const sync = createSyncService(deps);

    const result = await sync.uploadAfterSave(localPayload);

    expect(result.uploaded).toBe(false);
    expect(deps.driveFiles.download).not.toHaveBeenCalled();
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
  });

  it('refuses to push before the lineage was verified in this session', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    const sync = createSyncService(deps);

    const result = await sync.uploadAfterSave(localPayload);

    expect(result.uploaded).toBe(false);
    expect(result.reason).toMatch(/lineage/);
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
  });

  it('skips the push when the remote grew newer mid-session (T8 resolves)', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(localPayload);
    const sync = createSyncService(deps);
    await sync.open(localPayload, 'master-pw'); // lineage verified

    deps.vaultStore.decryptWithSession.mockReturnValue({
      ...localPayload,
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    const result = await sync.uploadAfterSave(localPayload);

    expect(result.uploaded).toBe(false);
    expect(result.reason).toMatch(/remote-newer/);
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
    expect(deps.config.recordSync).toHaveBeenCalledWith(false, 'remote-newer');
  });

  it('uploads after the lineage is verified and the remote is not newer', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(localPayload);
    const sync = createSyncService(deps);
    await sync.open(localPayload, 'master-pw');

    const result = await sync.uploadAfterSave(localPayload);

    expect(result.uploaded).toBe(true);
    expect(deps.driveFiles.upload).toHaveBeenCalledWith(localEnvelope);
    expect(deps.config.recordSync).toHaveBeenCalledWith(true);
  });

  it('records the failure instead of throwing when the upload fails', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    deps.vaultStore.decryptWithSession.mockReturnValue(localPayload);
    const sync = createSyncService(deps);
    await sync.open(localPayload, 'master-pw');
    deps.driveFiles.upload.mockRejectedValue(new Error('quota exceeded'));

    const result = await sync.uploadAfterSave(localPayload);

    expect(result.uploaded).toBe(false);
    expect(result.reason).toBe('quota exceeded');
    expect(deps.config.recordSync).toHaveBeenCalledWith(
      false,
      'quota exceeded',
    );
  });

  it('never rejects when the config store itself is broken (A2)', async () => {
    const deps = makeDeps({ remote: localEnvelope });
    deps.config.getStatus.mockImplementation(() => {
      throw new Error('electron-store read failed');
    });
    const sync = createSyncService(deps);

    await expect(sync.uploadAfterSave(localPayload)).resolves.toBeDefined();
  });
});
