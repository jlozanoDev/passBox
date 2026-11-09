import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deriveKey } from '../crypto/vault.js';
import { createSharedSalt } from './row-crypto.js';
import { createSupabaseCloud } from './supabase-cloud.js';

const master = 'correct horse battery staple';
const salt = createSharedSalt();
const key = deriveKey(master, Buffer.from(salt, 'base64'));

const credentials = {
  projectUrl: 'https://abcdefgh.supabase.co',
  databaseUrl:
    'postgresql://postgres.abcdefgh:secretpw@pooler.supabase.com:6543/postgres',
};

function makeConfig() {
  let projectUrl = null;
  let databaseUrlBlob = null;
  let lastSync = null;
  return {
    getProjectUrl: vi.fn(() => projectUrl),
    setProjectUrl: vi.fn((url) => {
      projectUrl = url;
    }),
    getDatabaseUrlBlob: vi.fn(() => databaseUrlBlob),
    setSecretBlobs: vi.fn((blobs) => {
      databaseUrlBlob = blobs.databaseUrlBlob;
    }),
    clearSecrets: vi.fn(() => {
      databaseUrlBlob = null;
    }),
    recordSync: vi.fn((ok, error) => {
      lastSync = { ok, ...(error ? { error } : {}) };
    }),
    getLastSync: vi.fn(() => lastSync),
    getStatus: vi.fn(() => ({
      hasCredentials: Boolean(projectUrl),
      connected: Boolean(databaseUrlBlob),
    })),
  };
}

function makeVaultStore({ unlocked = true, payload = null } = {}) {
  return {
    status: vi.fn(() => ({ exists: true, unlocked })),
    encryptSessionData: vi.fn((data) => ({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: Buffer.from(JSON.stringify(data)).toString('base64'),
    })),
    decryptSessionData: vi.fn((blob) =>
      JSON.parse(Buffer.from(blob.ciphertext, 'base64').toString('utf8')),
    ),
    readEnvelope: vi.fn(() => ({
      iv: 'aXY=',
      authTag: 'dGFn',
      ciphertext: 'x',
    })),
    decryptWithSession: vi.fn(() => payload),
    save: vi.fn((p) => p),
  };
}

function makeSqlFactory({ rows = [], saltValue = salt } = {}) {
  const state = { rows: [...rows] };
  const createSqlClient = vi.fn(() => {
    const sql = vi.fn((strings, ...values) => {
      const text = Array.isArray(strings) ? strings.join('?') : String(strings);
      const params = Array.isArray(strings) ? values : [];
      if (text.includes('FROM passbox_meta')) {
        return Promise.resolve(
          saltValue ? [{ key: 'vault_salt', value: saltValue }] : [],
        );
      }
      if (text.includes('INSERT INTO passbox_meta')) {
        return Promise.resolve([]);
      }
      if (text.includes('FROM passbox_secrets')) {
        return Promise.resolve(
          state.rows
            .filter((r) => !r.deleted_at)
            .map((r) => ({
              id: r.id,
              iv: r.iv,
              authTag: r.auth_tag,
              ciphertext: r.ciphertext,
              updatedAt: r.updated_at,
            })),
        );
      }
      if (text.includes('INSERT INTO passbox_secrets')) {
        const [id, iv, authTag, ciphertext, updatedAt] = params;
        const existing = state.rows.find((r) => r.id === id);
        if (existing) {
          Object.assign(existing, {
            iv,
            auth_tag: authTag,
            ciphertext,
            updated_at: updatedAt,
            deleted_at: null,
          });
        } else {
          state.rows.push({
            id,
            iv,
            auth_tag: authTag,
            ciphertext,
            updated_at: updatedAt,
            deleted_at: null,
          });
        }
        return Promise.resolve([]);
      }
      if (text.includes('UPDATE passbox_secrets')) {
        const id = params[0];
        const existing = state.rows.find((r) => r.id === id);
        if (existing) existing.deleted_at = new Date().toISOString();
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    sql.unsafe = vi.fn(() => Promise.resolve([]));
    sql.end = vi.fn(() => Promise.resolve());
    return sql;
  });
  return { createSqlClient, state };
}

describe('supabase-cloud connect (S1/S4/S6)', () => {
  let config;
  let vaultStore;
  let sqlFactory;

  beforeEach(() => {
    config = makeConfig();
    vaultStore = makeVaultStore();
    sqlFactory = makeSqlFactory();
  });

  it('requires an unlocked vault', async () => {
    vaultStore = makeVaultStore({ unlocked: false });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await expect(cloud.connect(credentials)).rejects.toThrow(/unlocked/i);
  });

  it('rejects missing fields before any network call', async () => {
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await expect(
      cloud.connect({ projectUrl: '', databaseUrl: 'd' }),
    ).rejects.toThrow(/project URL/i);
    await expect(
      cloud.connect({ projectUrl: credentials.projectUrl, databaseUrl: '' }),
    ).rejects.toThrow(/connection URL/i);
    expect(sqlFactory.createSqlClient).not.toHaveBeenCalled();
  });

  it('rejects an API key pasted as the connection string (A1 UX)', async () => {
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await expect(
      cloud.connect({
        projectUrl: credentials.projectUrl,
        databaseUrl: '_publishable_n014xdiYJ8-BJ_BClf0Krg_Tj6fo4CG',
      }),
    ).rejects.toThrow(/postgresql:\/\//i);
    expect(sqlFactory.createSqlClient).not.toHaveBeenCalled();
    expect(config.setSecretBlobs).not.toHaveBeenCalled();
  });

  it('maps ENOTFOUND on a direct db.* host to a session-pooler hint', async () => {
    sqlFactory.createSqlClient = vi.fn(() => {
      const sql = vi.fn();
      sql.unsafe = vi.fn(() =>
        Promise.reject(
          new Error('getaddrinfo ENOTFOUND db.abcdefgh.supabase.co'),
        ),
      );
      sql.end = vi.fn(() => Promise.resolve());
      return sql;
    });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await expect(
      cloud.connect({
        projectUrl: credentials.projectUrl,
        databaseUrl:
          'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
      }),
    ).rejects.toThrow(/Session pooler/i);
    expect(config.setSecretBlobs).not.toHaveBeenCalled();
  });

  it('connects with projectUrl + databaseUrl only — no service key (A1)', async () => {
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    const result = await cloud.connect(credentials);
    expect(result).toEqual({ connected: true });
    expect(sqlFactory.createSqlClient).toHaveBeenCalledWith(
      credentials.databaseUrl,
    );
    expect(vaultStore.encryptSessionData).toHaveBeenCalledWith({
      databaseUrl: credentials.databaseUrl,
    });
    expect(vaultStore.encryptSessionData).not.toHaveBeenCalledWith(
      expect.objectContaining({ serviceKey: expect.anything() }),
    );
    expect(config.setSecretBlobs).toHaveBeenCalled();
    expect(config.getStatus().connected).toBe(true);
    const blobs = config.setSecretBlobs.mock.calls[0][0];
    expect(blobs.databaseUrlBlob.ciphertext).not.toContain('secretpw');
    expect(blobs).not.toHaveProperty('serviceKeyBlob');
  });

  it('does not mark connected when migration fails', async () => {
    sqlFactory.createSqlClient = vi.fn(() => {
      const sql = vi.fn();
      sql.unsafe = vi.fn(() => Promise.reject(new Error('permission denied')));
      sql.end = vi.fn(() => Promise.resolve());
      return sql;
    });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await expect(cloud.connect(credentials)).rejects.toThrow(
      /permission denied/,
    );
    expect(config.setSecretBlobs).not.toHaveBeenCalled();
  });

  it('disconnect clears secrets but keeps projectUrl', async () => {
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await cloud.connect(credentials);
    cloud.disconnect();
    expect(config.clearSecrets).toHaveBeenCalled();
    expect(config.getStatus()).toEqual({
      hasCredentials: true,
      connected: false,
    });
  });
});

describe('supabase-cloud open/upload (S3/S5 row sync)', () => {
  let config;
  let vaultStore;
  let sqlFactory;
  let cloud;

  const localPayload = {
    version: '1.0.0',
    salt,
    updatedAt: '2026-01-02T00:00:00.000Z',
    items: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        title: 'Local GitHub',
        secret: 'local-secret',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
  };

  async function connectedCloud(rows = []) {
    config = makeConfig();
    vaultStore = makeVaultStore();
    sqlFactory = makeSqlFactory({ rows, saltValue: salt });
    cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await cloud.connect(credentials);
    return cloud;
  }

  it('seeds empty cloud with local items (S8 import on first open)', async () => {
    const c = await connectedCloud();
    const result = await c.open(localPayload, master);
    expect(result.action).toBe('seeded');
    expect(result.payload.items).toHaveLength(1);
    expect(sqlFactory.state.rows).toHaveLength(1);
    const stored = sqlFactory.state.rows[0];
    expect(stored.ciphertext).not.toContain('local-secret');
    expect(config.recordSync).toHaveBeenCalledWith(true);
  });

  it('skips when not connected', async () => {
    config = makeConfig();
    vaultStore = makeVaultStore();
    sqlFactory = makeSqlFactory();
    cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    const result = await cloud.open(localPayload, master);
    expect(result.action).toBe('skipped');
    expect(sqlFactory.createSqlClient).not.toHaveBeenCalled();
  });

  it('pulls remote rows into the payload when remote has newer items', async () => {
    const { encryptRow } = await import('./row-crypto.js');
    const remoteItem = {
      id: '99999999-8888-7777-6666-555555555555',
      title: 'From other device',
      secret: 'remote-secret',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const row = encryptRow(remoteItem, key);
    const c = await connectedCloud([
      {
        id: remoteItem.id,
        iv: row.iv,
        auth_tag: row.authTag,
        ciphertext: row.ciphertext,
        updated_at: remoteItem.updatedAt,
        deleted_at: null,
      },
    ]);
    const result = await c.open(localPayload, master);
    expect(result.payload.items.map((i) => i.id)).toContain(remoteItem.id);
    expect(result.payload.items.find((i) => i.id === remoteItem.id).title).toBe(
      'From other device',
    );
  });

  it('never blocks unlock when the network fails (local-first)', async () => {
    await connectedCloud();
    sqlFactory.createSqlClient = vi.fn(() => {
      const sql = vi.fn(() => Promise.reject(new Error('network down')));
      sql.unsafe = vi.fn(() => Promise.reject(new Error('network down')));
      sql.end = vi.fn(() => Promise.resolve());
      return sql;
    });
    // rebind by creating new cloud with failing factory
    const failing = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    const result = await failing.open(localPayload, master);
    expect(result.action).toBe('offline');
    expect(result.payload).toBe(localPayload);
    expect(config.recordSync).toHaveBeenCalledWith(false, 'network down');
  });

  it('uploadAfterSave upserts ciphertext rows after verified open', async () => {
    const c = await connectedCloud();
    await c.open(localPayload, master);
    const mutated = {
      ...localPayload,
      items: [
        ...localPayload.items,
        {
          id: '22222222-3333-4444-5555-666666666666',
          title: 'AWS',
          secret: 'new-secret',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const result = await c.uploadAfterSave(mutated);
    expect(result.uploaded).toBe(true);
    expect(sqlFactory.state.rows).toHaveLength(2);
    for (const r of sqlFactory.state.rows) {
      expect(r.ciphertext).not.toMatch(/secret|AWS|GitHub/);
    }
  });

  it('uploadAfterSave refuses before lineage is verified', async () => {
    const c = await connectedCloud();
    const result = await c.uploadAfterSave(localPayload);
    expect(result.uploaded).toBe(false);
    expect(result.reason).toMatch(/lineage/);
  });

  it('two clients with same master password share the salt (S3)', async () => {
    const c = await connectedCloud();
    await c.open(localPayload, master);
    // second client: same encrypted secrets blobs pattern
    const config2 = makeConfig();
    config2.setProjectUrl(credentials.projectUrl);
    config2.setSecretBlobs({
      databaseUrlBlob: vaultStore.encryptSessionData({
        databaseUrl: credentials.databaseUrl,
      }),
    });
    const c3 = createSupabaseCloud({
      config: config2,
      vaultStore: makeVaultStore(),
      createSqlClient: sqlFactory.createSqlClient,
    });
    const opened = await c3.open(
      { ...localPayload, items: [], updatedAt: '2020-01-01T00:00:00.000Z' },
      master,
    );
    expect(opened.payload.items.some((i) => i.title === 'Local GitHub')).toBe(
      true,
    );
    void c;
  });
});

describe('supabase-cloud verifier corrections (B1/B2/B3)', () => {
  const localPayload = {
    version: '1.0.0',
    salt,
    updatedAt: '2026-01-02T00:00:00.000Z',
    items: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        title: 'Local GitHub',
        secret: 'local-secret',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
  };

  async function setup(rows = []) {
    const config = makeConfig();
    const vaultStore = makeVaultStore({ payload: localPayload });
    const sqlFactory = makeSqlFactory({ rows, saltValue: salt });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await cloud.connect(credentials);
    return { cloud, config, vaultStore, sqlFactory };
  }

  it('B1: does not soft-delete a peer row this client never pulled', async () => {
    const { encryptRow } = await import('./row-crypto.js');
    const peerItem = {
      id: '33333333-4444-5555-6666-777777777777',
      title: 'Peer only',
      secret: 'peer-secret',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const peerRow = encryptRow(peerItem, key);
    // First open sees only the local seed (no peer row yet).
    const { cloud, sqlFactory } = await setup();
    await cloud.open(localPayload, master);

    // Peer row appears after our open — never in knownRemoteIds.
    sqlFactory.state.rows.push({
      id: peerItem.id,
      iv: peerRow.iv,
      auth_tag: peerRow.authTag,
      ciphertext: peerRow.ciphertext,
      updated_at: peerItem.updatedAt,
      deleted_at: null,
    });

    const result = await cloud.uploadAfterSave(localPayload);
    expect(result.uploaded).toBe(true);
    const peer = sqlFactory.state.rows.find((r) => r.id === peerItem.id);
    expect(peer.deleted_at).toBeNull();
  });

  it('B1: soft-deletes a known row the local payload intentionally dropped', async () => {
    const { encryptRow } = await import('./row-crypto.js');
    const knownItem = {
      id: '44444444-5555-6666-7777-888888888888',
      title: 'Was shared',
      secret: 'was-shared',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const knownRow = encryptRow(knownItem, key);
    const { cloud, sqlFactory } = await setup([
      {
        id: knownItem.id,
        iv: knownRow.iv,
        auth_tag: knownRow.authTag,
        ciphertext: knownRow.ciphertext,
        updated_at: knownItem.updatedAt,
        deleted_at: null,
      },
    ]);
    // open pulls the known row into knownRemoteIds (merged with local).
    await cloud.open(localPayload, master);

    // Local now drops it (user deleted) and is newer than the remote row.
    const afterDelete = {
      ...localPayload,
      items: localPayload.items,
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const result = await cloud.uploadAfterSave(afterDelete);
    expect(result.uploaded).toBe(true);
    const known = sqlFactory.state.rows.find((r) => r.id === knownItem.id);
    expect(known.deleted_at).toBeTruthy();
  });

  it('B2: one undecryptable row does not abort the pull', async () => {
    const { encryptRow } = await import('./row-crypto.js');
    const goodItem = {
      id: '55555555-6666-7777-8888-999999999999',
      title: 'Readable',
      secret: 'ok',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const goodRow = encryptRow(goodItem, key);
    const { cloud } = await setup([
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        iv: 'aXY=',
        auth_tag: 'dGFn',
        // Valid base64 that fails GCM auth under this key.
        ciphertext: Buffer.from('not-encrypted-by-this-key').toString('base64'),
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      },
      {
        id: goodItem.id,
        iv: goodRow.iv,
        auth_tag: goodRow.authTag,
        ciphertext: goodRow.ciphertext,
        updated_at: goodItem.updatedAt,
        deleted_at: null,
      },
    ]);
    const result = await cloud.open(localPayload, master);
    expect(result.action).not.toBe('offline');
    expect(result.payload.items.map((i) => i.id)).toContain(goodItem.id);
    expect(result.payload.items.map((i) => i.id)).toContain(
      localPayload.items[0].id,
    );
  });

  it('B3: connect with masterPassword bootstraps import and verifies lineage', async () => {
    const config = makeConfig();
    const vaultStore = makeVaultStore({ payload: localPayload });
    const sqlFactory = makeSqlFactory({ rows: [], saltValue: salt });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    await cloud.connect(credentials, { masterPassword: master });
    expect(sqlFactory.state.rows).toHaveLength(1);
    expect(sqlFactory.state.rows[0].ciphertext).not.toContain('local-secret');

    // Save must not refuse with lineage-unverified after connect.
    const result = await cloud.uploadAfterSave(localPayload);
    expect(result.uploaded).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('B3: connect without masterPassword still succeeds (next open bootstraps)', async () => {
    const config = makeConfig();
    const vaultStore = makeVaultStore({ payload: localPayload });
    const sqlFactory = makeSqlFactory({ rows: [], saltValue: salt });
    const cloud = createSupabaseCloud({
      config,
      vaultStore,
      createSqlClient: sqlFactory.createSqlClient,
    });
    const result = await cloud.connect(credentials);
    expect(result).toEqual({ connected: true });
    expect(config.getStatus().connected).toBe(true);
  });
});
