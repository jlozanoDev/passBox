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
const ENVELOPE_KEYS = ['salt', 'iv', 'authTag', 'ciphertext'];

function isNotFound(err) {
  return Number(err?.code) === 404 || Number(err?.response?.status) === 404;
}

/**
 * Shape gate: both directions must carry a well-formed ciphertext
 * envelope — plaintext can never cross this boundary (S6/S3).
 * @param {unknown} envelope
 */
export function assertEnvelope(envelope) {
  const valid =
    envelope !== null &&
    typeof envelope === 'object' &&
    !Array.isArray(envelope) &&
    ENVELOPE_KEYS.every(
      (key) => typeof envelope[key] === 'string' && envelope[key].length > 0,
    );
  if (!valid) {
    throw new Error(
      'Invalid vault envelope: expected base64 strings {salt, iv, authTag, ciphertext}',
    );
  }
}

function parseEnvelopeBody(data) {
  let parsed = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('Remote vault file is not valid JSON');
    }
  }
  assertEnvelope(parsed);
  return parsed;
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
   * search inside appDataFolder (RNF-03). Newest-first ordering keeps
   * the choice deterministic if duplicates ever exist.
   * @returns {Promise<string|null>}
   */
  async function resolveFileId(drive) {
    const cached = config.getFileId();
    if (cached) return cached;

    const res = await drive.files.list({
      spaces: APP_DATA_FOLDER,
      q: `name = '${VAULT_FILE_NAME}'`,
      fields: 'files(id, name)',
      orderBy: 'createdTime desc',
      pageSize: 1,
    });
    const files = res.data?.files ?? [];
    if (files.length === 0) return null;

    config.setFileId(files[0].id);
    return files[0].id;
  }

  async function createVaultFile(drive, media) {
    const res = await drive.files.create({
      requestBody: { name: VAULT_FILE_NAME, parents: [APP_DATA_FOLDER] },
      media,
      fields: 'id',
    });
    config.setFileId(res.data.id);
    return { fileId: res.data.id, created: true };
  }

  return {
    /**
     * Upload the encrypted envelope (create or update). The envelope
     * must come from the vault file on disk, never from the renderer.
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @returns {Promise<{fileId: string, created: boolean}>}
     */
    async upload(envelope) {
      assertEnvelope(envelope);
      const drive = createDriveClient();
      const media = {
        mimeType: JSON_MIME,
        body: JSON.stringify(envelope),
      };
      const fileId = await resolveFileId(drive);

      if (!fileId) {
        return createVaultFile(drive, media);
      }

      try {
        await drive.files.update({ fileId, media, fields: 'id' });
        return { fileId, created: false };
      } catch (err) {
        if (!isNotFound(err)) throw err;
        // Stale id (file replaced remotely, e.g. another device
        // recreated it after an appDataFolder wipe): re-resolve by
        // name before ever creating, so no duplicates are forked.
        config.clearFileId();
        const freshId = await resolveFileId(drive);
        if (freshId) {
          try {
            await drive.files.update({ fileId: freshId, media, fields: 'id' });
            return { fileId: freshId, created: false };
          } catch (retryErr) {
            if (!isNotFound(retryErr)) throw retryErr;
            config.clearFileId();
          }
        }
        return createVaultFile(drive, media);
      }
    },

    /**
     * Download the encrypted envelope from the cloud.
     * @returns {Promise<object|null>} envelope, or null when no remote
     *   vault exists yet (first sync / nothing to pull)
     */
    async download() {
      const drive = createDriveClient();
      let fileId = await resolveFileId(drive);
      if (!fileId) return null;

      let retried = false;
      for (;;) {
        try {
          const res = await drive.files.get({ fileId, alt: 'media' });
          return parseEnvelopeBody(res.data);
        } catch (err) {
          if (!isNotFound(err) || retried) throw err;
          // Stale id: re-resolve by name once (file may have been
          // recreated by another device), otherwise report absence.
          config.clearFileId();
          fileId = await resolveFileId(drive);
          if (!fileId) return null;
          retried = true;
        }
      }
    },
  };
}
