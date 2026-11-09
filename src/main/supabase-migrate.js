/**
 * Supabase schema migrator (spec S4): ensures the Passbox tables exist
 * in the user's database. Every statement is idempotent
 * (CREATE TABLE IF NOT EXISTS) so Connect can run it on every launch
 * without touching existing rows. Never drops or truncates.
 *
 * The SQL client is injected so unit tests never need a live database.
 *
 * @param {{sql: Function}} deps sql tagged-template function with .end()
 */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS passbox_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passbox_secrets (
  id uuid PRIMARY KEY,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS passbox_secrets_updated_at_idx
  ON passbox_secrets (updated_at);
`;

export function createSupabaseMigrator({ sql }) {
  return {
    /**
     * Run the idempotent migration and close the client.
     * @returns {Promise<{migrated: boolean}>}
     */
    async ensure() {
      try {
        // postgres.js: raw multi-statement string goes through .unsafe
        await sql.unsafe(MIGRATION_SQL);
        return { migrated: true };
      } finally {
        await sql.end?.();
      }
    },
  };
}
