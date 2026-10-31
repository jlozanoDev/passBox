import { describe, expect, it, vi } from 'vitest';
import { createSyncService } from './sync.js';

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

function makeDeps({ connected = true, remote = null } = {}) {
  const config = {
    getStatus: vi.fn(() => ({ hasCredentials: true, connected })),
    recordSync: vi.fn(),
  };
  const vaultStore = {
    readEnvelope: vi.fn(() => localEnvelope),
    decryptWithSession: vi.fn(() => {
      throw new Error('auth failure');
    }),
    replaceEnvelope: vi.fn(),
    rekey: vi.fn(() => {
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
    expect(deps.vaultStore.rekey).not.toHaveBeenCalled();
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

  it('rekeys when the remote uses a different salt but the same password', async () => {
    const remotePayload = {
      ...localPayload,
      salt: 'RE1PVEU=',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const remoteEnvelope = { ...localEnvelope, salt: 'RE1PVEU=' };
    const deps = makeDeps({ remote: remoteEnvelope });
    deps.vaultStore.rekey.mockReturnValue(remotePayload);
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('pulled');
    expect(result.payload).toBe(remotePayload);
    expect(deps.vaultStore.rekey).toHaveBeenCalledWith(
      remoteEnvelope,
      'master-pw',
    );
  });

  it('refuses a remote vault created with a different master password', async () => {
    const remoteEnvelope = { ...localEnvelope, salt: 'T1RIRVI=' };
    const deps = makeDeps({ remote: remoteEnvelope });
    const sync = createSyncService(deps);

    const result = await sync.open(localPayload, 'master-pw');

    expect(result.action).toBe('incompatible');
    expect(result.payload).toBe(localPayload);
    // Never replace, never push over an unreadable lineage.
    expect(deps.vaultStore.replaceEnvelope).not.toHaveBeenCalled();
    expect(deps.driveFiles.upload).not.toHaveBeenCalled();
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
});
