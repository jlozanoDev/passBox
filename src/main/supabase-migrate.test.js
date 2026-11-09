import { describe, expect, it, vi } from 'vitest';
import { MIGRATION_SQL, createSupabaseMigrator } from './supabase-migrate.js';

function createMockSql() {
  const batches = [];
  const sql = vi.fn();
  sql.unsafe = vi.fn((text) => {
    batches.push({ text });
    return Promise.resolve([]);
  });
  sql.end = vi.fn(() => Promise.resolve());
  return { sql, batches };
}

describe('supabase-migrate SQL (S4: idempotent schema)', () => {
  it('uses CREATE TABLE IF NOT EXISTS for secrets and meta', () => {
    expect(MIGRATION_SQL).toMatch(/CREATE TABLE IF NOT EXISTS passbox_meta/i);
    expect(MIGRATION_SQL).toMatch(
      /CREATE TABLE IF NOT EXISTS passbox_secrets/i,
    );
    expect(MIGRATION_SQL).not.toMatch(/CREATE TABLE passbox_/i);
  });

  it('never drops existing objects', () => {
    expect(MIGRATION_SQL).not.toMatch(/DROP TABLE/i);
    expect(MIGRATION_SQL).not.toMatch(/TRUNCATE/i);
  });

  it('stores only ciphertext columns for secret values (S2)', () => {
    expect(MIGRATION_SQL).toMatch(/ciphertext/i);
    expect(MIGRATION_SQL).toMatch(/auth_tag/i);
    expect(MIGRATION_SQL).toMatch(/\biv\b/i);
  });
});

describe('supabase-migrator ensure (S4)', () => {
  it('runs the migration SQL once and closes the client', async () => {
    const { sql, batches } = createMockSql();
    const migrator = createSupabaseMigrator({ sql });
    const result = await migrator.ensure();
    expect(result).toEqual({ migrated: true });
    expect(batches).toHaveLength(1);
    expect(batches[0].text).toBe(MIGRATION_SQL);
    expect(sql.unsafe).toHaveBeenCalledTimes(1);
    expect(sql.end).toHaveBeenCalledTimes(1);
  });

  it('is safe to call twice (idempotent ensure)', async () => {
    const { sql } = createMockSql();
    const migrator = createSupabaseMigrator({ sql });
    await migrator.ensure();
    await migrator.ensure();
    expect(sql.unsafe).toHaveBeenCalledTimes(2);
    expect(sql.end).toHaveBeenCalledTimes(2);
  });

  it('closes the client even when migration fails', async () => {
    const sql = vi.fn();
    sql.unsafe = vi.fn(() => Promise.reject(new Error('permission denied')));
    sql.end = vi.fn(() => Promise.resolve());
    const migrator = createSupabaseMigrator({ sql });
    await expect(migrator.ensure()).rejects.toThrow(/permission denied/);
    expect(sql.end).toHaveBeenCalledTimes(1);
  });
});
