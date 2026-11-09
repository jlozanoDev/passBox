import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { deriveKey, SALT_BYTES } from '../crypto/vault.js';
import { createSharedSalt, encryptRow } from './row-crypto.js';
import { createSupabaseStore } from './supabase-store.js';

const master = 'correct horse battery staple';

function createMockSql(handlers = {}) {
  const calls = [];
  const sql = vi.fn((strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    const params = Array.isArray(strings) ? values : [];
    calls.push({ text, params });
    const handler = handlers[text] ?? handlers.default;
    if (handler) return Promise.resolve(handler(params, text));
    return Promise.resolve([]);
  });
  sql.unsafe = vi.fn((text) => {
    calls.push({ text, params: [] });
    const handler = handlers.unsafe ?? handlers.default;
    return Promise.resolve(handler ? handler([], text) : []);
  });
  sql.end = vi.fn(() => Promise.resolve());
  return { sql, calls };
}

const saltValue = createSharedSalt();
const key = deriveKey(master, Buffer.from(saltValue, 'base64'));

const itemA = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'GitHub',
  category: 'password',
  username: 'alice',
  secret: 'hunter2',
  notes: '',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
};

describe('supabase-store ensureSalt (S3: shared salt bootstrap)', () => {
  it('returns existing salt from passbox_meta without inserting', async () => {
    const { sql, calls } = createMockSql({
      default: (params, text) => {
        if (text.includes('FROM passbox_meta')) {
          return [{ key: 'vault_salt', value: saltValue }];
        }
        return [];
      },
    });
    const store = createSupabaseStore({ sql });
    const salt = await store.ensureSalt();
    expect(salt).toBe(saltValue);
    expect(calls.some((c) => c.text.includes('INSERT INTO passbox_meta'))).toBe(
      false,
    );
  });

  it('creates and returns a fresh salt when meta is empty', async () => {
    let metaRows = [];
    const { sql, calls } = createMockSql({
      default: (params, text) => {
        if (text.includes('FROM passbox_meta')) return metaRows;
        if (text.includes('INSERT INTO passbox_meta')) {
          metaRows = [{ key: 'vault_salt', value: params[0] }];
          return metaRows;
        }
        return [];
      },
    });
    const store = createSupabaseStore({ sql });
    const salt = await store.ensureSalt();
    expect(typeof salt).toBe('string');
    expect(Buffer.from(salt, 'base64')).toHaveLength(SALT_BYTES);
    expect(calls.some((c) => c.text.includes('INSERT INTO passbox_meta'))).toBe(
      true,
    );
    expect(metaRows[0].value).toBe(salt);
  });

  it('is idempotent across two clients (same salt on second call)', async () => {
    const shared = { rows: [] };
    const { sql } = createMockSql({
      default: (params, text) => {
        if (text.includes('FROM passbox_meta')) return shared.rows;
        if (text.includes('INSERT INTO passbox_meta')) {
          shared.rows = [{ key: 'vault_salt', value: params[0] }];
          return shared.rows;
        }
        return [];
      },
    });
    const a = createSupabaseStore({ sql });
    const b = createSupabaseStore({ sql });
    const saltA = await a.ensureSalt();
    const saltB = await b.ensureSalt();
    expect(saltB).toBe(saltA);
  });
});

describe('supabase-store list/upsert/delete (S5: all passwords)', () => {
  it('lists only non-deleted rows with the deleted_at filter in SQL', async () => {
    const row = encryptRow(itemA, key);
    const mock = createMockSql({
      default: (params, text) => {
        if (text.includes('FROM passbox_secrets')) {
          if (text.includes('deleted_at IS NULL')) {
            return [
              {
                id: itemA.id,
                ciphertext: row.ciphertext,
                iv: row.iv,
                authTag: row.authTag,
                updatedAt: itemA.updatedAt,
              },
            ];
          }
          return [];
        }
        return [];
      },
    });
    const store = createSupabaseStore({ sql: mock.sql });
    const rows = await store.listRows();
    expect(mock.calls[0].text).toMatch(/deleted_at IS NULL/);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(itemA.id);
    expect(rows[0].authTag).toBe(row.authTag);
    expect(rows[0].ciphertext).toBe(row.ciphertext);
  });

  it('upserts a ciphertext row with ON CONFLICT', async () => {
    const mock = createMockSql({
      default: (params, text) => {
        if (text.includes('INSERT INTO passbox_secrets')) return [];
        return [];
      },
    });
    const store = createSupabaseStore({ sql: mock.sql });
    const row = encryptRow(itemA, key);
    await store.upsertRow({
      id: itemA.id,
      ...row,
      updatedAt: itemA.updatedAt,
    });
    const insert = mock.calls.find((c) =>
      c.text.includes('INSERT INTO passbox_secrets'),
    );
    expect(insert).toBeTruthy();
    expect(insert.text).toMatch(/ON CONFLICT \(id\)/i);
    expect(insert.params).toContain(itemA.id);
    expect(insert.params).toContain(row.ciphertext);
  });

  it('soft-deletes by setting deleted_at', async () => {
    const mock = createMockSql({
      default: () => [],
    });
    const store = createSupabaseStore({ sql: mock.sql });
    await store.softDelete(itemA.id);
    const update = mock.calls.find((c) =>
      c.text.includes('UPDATE passbox_secrets'),
    );
    expect(update).toBeTruthy();
    expect(update.text).toMatch(/deleted_at/i);
    expect(update.params).toContain(itemA.id);
  });

  it('returns empty list when the table has no rows', async () => {
    const mock = createMockSql({ default: () => [] });
    const store = createSupabaseStore({ sql: mock.sql });
    expect(await store.listRows()).toEqual([]);
  });
});

describe('supabase-store importLocalVault (S8)', () => {
  let mock;
  let store;

  beforeEach(() => {
    mock = createMockSql({ default: () => [] });
    store = createSupabaseStore({ sql: mock.sql });
  });

  it('encrypts every local item into a row (no plaintext params)', async () => {
    const items = [
      itemA,
      {
        ...itemA,
        id: '22222222-3333-4444-5555-666666666666',
        title: 'AWS',
        secret: 'AKIA...',
      },
    ];
    const result = await store.importItems(items, key);
    expect(result.imported).toBe(2);
    const inserts = mock.calls.filter((c) =>
      c.text.includes('INSERT INTO passbox_secrets'),
    );
    expect(inserts).toHaveLength(2);
    for (const call of inserts) {
      for (const param of call.params) {
        expect(String(param)).not.toContain('hunter2');
        expect(String(param)).not.toContain('AKIA');
        expect(String(param)).not.toContain('GitHub');
      }
    }
  });

  it('importing zero items is a no-op', async () => {
    const result = await store.importItems([], key);
    expect(result).toEqual({ imported: 0 });
    expect(mock.calls.filter((c) => c.text.includes('INSERT'))).toHaveLength(0);
  });
});

describe('key derivation stability for import', () => {
  it('same master+salt produces the key that decrypts imported rows', async () => {
    const salt = randomBytes(SALT_BYTES);
    const k = deriveKey(master, salt);
    const row = encryptRow(itemA, k);
    const mock = createMockSql({
      default: (params, text) => {
        if (text.includes('FROM passbox_secrets')) {
          return [
            {
              id: itemA.id,
              ciphertext: row.ciphertext,
              iv: row.iv,
              authTag: row.authTag,
              updatedAt: itemA.updatedAt,
            },
          ];
        }
        return [];
      },
    });
    const store = createSupabaseStore({ sql: mock.sql });
    const rows = await store.listRows();
    expect(rows).toHaveLength(1);
  });
});
