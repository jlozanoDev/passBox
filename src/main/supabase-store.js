import { createSharedSalt, encryptRow } from './row-crypto.js';

/**
 * Supabase row store (specs S5/S8): list, upsert and soft-delete the
 * passbox_secrets rows, plus shared-salt bootstrap in passbox_meta.
 * The SQL client is injected (postgres.js style: tagged template with
 * .unsafe for multi-statement SQL) so unit tests never need a network.
 *
 * This module only moves ciphertext — plaintext items are encrypted
 * by the caller (or via importItems) before they reach any parameter.
 *
 * @param {{sql: Function}} deps
 */
export function createSupabaseStore({ sql }) {
  return {
    /**
     * Read the shared salt; create one on first use (S3 multi-client).
     * @returns {Promise<string>} base64 salt
     */
    async ensureSalt() {
      const rows = await sql`
        SELECT key, value FROM passbox_meta WHERE key = 'vault_salt'
      `;
      if (rows?.length > 0 && rows[0].value) {
        return rows[0].value;
      }
      const salt = createSharedSalt();
      await sql`
        INSERT INTO passbox_meta (key, value)
        VALUES ('vault_salt', ${salt})
        ON CONFLICT (key) DO NOTHING
      `;
      // Re-read so two concurrent first-connects converge on one salt
      const again = await sql`
        SELECT key, value FROM passbox_meta WHERE key = 'vault_salt'
      `;
      return again[0].value;
    },

    /**
     * All live secret rows (S5: every password the key can read).
     * @returns {Promise<Array<{id: string, iv: string, authTag: string,
     *   ciphertext: string, updatedAt: string}>>}
     */
    async listRows() {
      const rows = await sql`
        SELECT id, iv, auth_tag AS "authTag", ciphertext, updated_at AS "updatedAt"
        FROM passbox_secrets
        WHERE deleted_at IS NULL
        ORDER BY updated_at ASC
      `;
      return (rows ?? []).map((row) => ({
        id: row.id,
        iv: row.iv,
        authTag: row.authTag,
        ciphertext: row.ciphertext,
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : row.updatedAt,
      }));
    },

    /**
     * Create or replace one ciphertext row.
     * @param {{id: string, iv: string, authTag: string,
     *   ciphertext: string, updatedAt: string}} row
     */
    async upsertRow({ id, iv, authTag, ciphertext, updatedAt }) {
      if (!id || !iv || !authTag || !ciphertext) {
        throw new Error('upsertRow requires id, iv, authTag and ciphertext');
      }
      await sql`
        INSERT INTO passbox_secrets (id, iv, auth_tag, ciphertext, updated_at)
        VALUES (${id}, ${iv}, ${authTag}, ${ciphertext}, ${updatedAt})
        ON CONFLICT (id) DO UPDATE SET
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          ciphertext = EXCLUDED.ciphertext,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `;
    },

    /** Soft-delete so other clients can observe the removal (S5). */
    async softDelete(id) {
      if (!id) throw new Error('softDelete requires id');
      await sql`
        UPDATE passbox_secrets
        SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
      `;
    },

    /**
     * Encrypt every plaintext item and upsert it (S8 local-vault import).
     * @param {Array<object>} items
     * @param {Buffer} key data key
     * @returns {Promise<{imported: number}>}
     */
    async importItems(items, key) {
      if (!Array.isArray(items) || items.length === 0) {
        return { imported: 0 };
      }
      for (const item of items) {
        const row = encryptRow(item, key);
        await this.upsertRow({
          id: item.id,
          ...row,
          updatedAt: item.updatedAt ?? new Date().toISOString(),
        });
      }
      return { imported: items.length };
    },
  };
}
