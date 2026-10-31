/**
 * Vault transport over Google Drive API v3 (spec S8/S3): uploads and
 * downloads the encrypted passbox.vault envelope to/from the hidden
 * appDataFolder. This module never sees plaintext — only ciphertext
 * envelopes — and talks to an injected Drive client so the API surface
 * stays unit-testable without network access.
 */

export const VAULT_FILE_NAME = 'passbox.vault';
export const APP_DATA_FOLDER = 'appDataFolder';

const JSON_MIME = 'application/json';

function isNotFound(err) {
  return Number(err?.code) === 404 || Number(err?.response?.status) === 404;
}

/**
 * @param {{
 *   config: {getFileId: Function, setFileId: Function, clearFileId: Function},
 *   createDriveClient: () => {files: object},
 * }} deps
 */
export function createDriveFiles({ config, createDriveClient }) {
  /**
   * Resolve the remote vault fileId: cached id first, then a name
   * search inside appDataFolder (RNF-03).
   * @returns {Promise<string|null>}
   */
  async function resolveFileId(drive) {
    const cached = config.getFileId();
    if (cached) return cached;

    const res = await drive.files.list({
      spaces: APP_DATA_FOLDER,
      q: `name = '${VAULT_FILE_NAME}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });
    const files = res.data?.files ?? [];
    if (files.length === 0) return null;

    config.setFileId(files[0].id);
    return files[0].id;
  }

  return {
    /**
     * Upload the encrypted envelope (create or update).
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @returns {Promise<{fileId: string, created: boolean}>}
     */
    async upload(envelope) {
      const drive = createDriveClient();
      const media = {
        mimeType: JSON_MIME,
        body: JSON.stringify(envelope),
      };
      const fileId = await resolveFileId(drive);

      if (!fileId) {
        const res = await drive.files.create({
          requestBody: { name: VAULT_FILE_NAME, parents: [APP_DATA_FOLDER] },
          media,
          fields: 'id',
        });
        config.setFileId(res.data.id);
        return { fileId: res.data.id, created: true };
      }

      try {
        await drive.files.update({ fileId, media, fields: 'id' });
        return { fileId, created: false };
      } catch (err) {
        if (!isNotFound(err)) throw err;
        // Cached id went stale (file removed) — recreate once.
        config.clearFileId();
        const res = await drive.files.create({
          requestBody: { name: VAULT_FILE_NAME, parents: [APP_DATA_FOLDER] },
          media,
          fields: 'id',
        });
        config.setFileId(res.data.id);
        return { fileId: res.data.id, created: true };
      }
    },

    /**
     * Download the encrypted envelope from the cloud.
     * @returns {Promise<object|null>} envelope, or null when no remote
     *   vault exists yet (first sync / nothing to pull)
     */
    async download() {
      const drive = createDriveClient();
      const fileId = await resolveFileId(drive);
      if (!fileId) return null;

      try {
        const res = await drive.files.get({ fileId, alt: 'media' });
        const data = res.data;
        return typeof data === 'string' ? JSON.parse(data) : data;
      } catch (err) {
        if (!isNotFound(err)) throw err;
        config.clearFileId();
        return null;
      }
    },
  };
}
