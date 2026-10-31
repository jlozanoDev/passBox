/**
 * Shared vault wire envelope (v1.0 S10): the {salt, iv, authTag,
 * ciphertext} shape that crosses disk and network boundaries. The S3
 * transport gates on this shape so plaintext can never leave the
 * crypto layer (S6/S2).
 */

export const VAULT_FILE_NAME = 'passbox.vault';

const ENVELOPE_KEYS = ['salt', 'iv', 'authTag', 'ciphertext'];

/**
 * Shape gate: both directions must carry a well-formed ciphertext
 * envelope — plaintext can never cross this boundary (S6/S2).
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

/**
 * Parse a remote body (JSON string or already-decoded object) into an
 * envelope, running the shape gate in either case.
 * @param {unknown} data
 */
export function parseEnvelopeBody(data) {
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
