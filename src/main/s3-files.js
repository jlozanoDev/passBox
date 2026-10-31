import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  VAULT_FILE_NAME,
  assertEnvelope,
  parseEnvelopeBody,
} from './vault-envelope.js';

export { VAULT_FILE_NAME };

/**
 * Missing-object detection across S3-compatible providers: AWS and B2
 * raise NoSuchKey; some variants surface a bare 404.
 * @param {unknown} err
 */
function isMissingObject(err) {
  return (
    err?.name === 'NoSuchKey' || Number(err?.$metadata?.httpStatusCode) === 404
  );
}

/**
 * Vault transport over the S3-compatible object API (spec S1/S3):
 * uploads and downloads the encrypted passbox.vault envelope as the
 * fixed object key `passbox.vault` inside the user's bucket (S4). No
 * fileId caching — the key is deterministic, which deletes the stale-id
 * re-resolve paths the Drive transport needed. The bucket and client
 * resolve per operation so a reconnect (new endpoint or secret) takes
 * effect without rebuilding the transport. This module never sees
 * plaintext — only ciphertext envelopes — and talks to an injected
 * client so the API surface stays unit-testable without network access.
 *
 * @param {{
 *   getBucket: () => string|null,
 *   createS3Client: () => {send: Function},
 * }} deps
 */
export function createS3Files({ getBucket, createS3Client }) {
  /** A cleared or never-saved config must fail loudly, not PUT nowhere. */
  function requireBucket() {
    const bucket = getBucket();
    if (!bucket) {
      throw new Error('Cloud sync is not configured');
    }
    return bucket;
  }

  return {
    /**
     * Upload the encrypted envelope (PUT, create-or-overwrite). The
     * envelope must come from the vault file on disk, never from the
     * renderer.
     * @param {{salt: string, iv: string, authTag: string, ciphertext: string}} envelope
     * @returns {Promise<{key: string}>}
     */
    async upload(envelope) {
      assertEnvelope(envelope);
      const bucket = requireBucket();
      const s3 = createS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: VAULT_FILE_NAME,
          Body: JSON.stringify(envelope),
          ContentType: 'application/json',
        }),
      );
      return { key: VAULT_FILE_NAME };
    },

    /**
     * Download the encrypted envelope from the cloud.
     * @returns {Promise<object|null>} envelope, or null when no remote
     *   vault exists yet (first sync / nothing to pull)
     */
    async download() {
      const bucket = requireBucket();
      const s3 = createS3Client();
      try {
        const res = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: VAULT_FILE_NAME }),
        );
        const body = await res.Body.transformToString();
        return parseEnvelopeBody(body);
      } catch (err) {
        if (isMissingObject(err)) return null;
        throw err;
      }
    },
  };
}
