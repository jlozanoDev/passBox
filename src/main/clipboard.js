/**
 * Clipboard surface for the main process (S10, S15).
 *
 * Secrets are written here so the renderer never needs an insecure-origin
 * clipboard permission. A sensitive copy schedules a best-effort clear that
 * only runs while the clipboard still holds the same value: the comparison
 * uses a SHA-256 fingerprint, so no plaintext secret is retained past the
 * call (the timer closure captures the hash only).
 */
import { createHash } from 'node:crypto';

export const SENSITIVE_CLEAR_MS = 30_000;

export function fingerprint(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * @param {{clipboard: {writeText: Function, readText: Function, clear: Function},
 *   setTimer?: Function, clearTimer?: Function}} deps
 */
export function createClipboardService({
  clipboard,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  /** @type {any} */
  let pending = null;

  function cancelPending() {
    if (pending) {
      clearTimer(pending);
      pending = null;
    }
  }

  /**
   * @param {unknown} text value to write
   * @param {{sensitive?: boolean}} [options]
   * @returns {{ok: boolean}}
   */
  function copy(text, options = {}) {
    if (typeof text !== 'string' || text.length === 0) return { ok: false };

    clipboard.writeText(text);
    cancelPending();

    if (options?.sensitive) {
      const expected = fingerprint(text);
      pending = setTimer(() => {
        pending = null;
        try {
          const current = clipboard.readText();
          if (current && fingerprint(current) === expected) clipboard.clear();
        } catch {
          // Best effort: a clipboard read failure must never crash the app.
        }
      }, SENSITIVE_CLEAR_MS);
      pending?.unref?.();
    }

    return { ok: true };
  }

  /** Drop the pending clear (used on quit so no timer outlives the app). */
  function flush() {
    cancelPending();
  }

  return { copy, flush };
}
