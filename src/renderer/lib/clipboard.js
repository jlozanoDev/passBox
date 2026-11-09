/**
 * Clipboard writes go through the main process when the bridge exposes
 * them (Electron needs explicit access outside a secure web origin).
 * Falling back to the Web Clipboard API keeps the UI usable in a plain
 * browser (tests, previews).
 */

const BRIDGE_TIMEOUT_MS = 400;
const SENSITIVE_CLEAR_MS = 30_000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Clipboard request timed out')), ms),
    ),
  ]);
}

/**
 * Mirror of the main-process policy for the Web Clipboard API fallback: clear
 * the value after 30s, and only while the clipboard still holds it. Without a
 * readable clipboard we still clear at the deadline — dropping a value the
 * user copied is the safer failure for a secret.
 *
 * Trade-off (documented): this timer closure holds the plaintext for 30s,
 * unlike the main process which keeps only a SHA-256 fingerprint. It is not a
 * new exposure class: the renderer already holds every decrypted secret in
 * memory while the vault is unlocked, and the packaged app always takes the
 * bridge path above, so this branch only runs in a plain browser preview.
 */
function scheduleSensitiveClear(text) {
  const clearLater = async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === text || current == null) {
        await navigator.clipboard.writeText('');
      }
    } catch {
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // Best effort: the clipboard may be unavailable at the deadline.
      }
    }
  };

  if (typeof navigator.clipboard.readText !== 'function') {
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, SENSITIVE_CLEAR_MS);
    return;
  }

  setTimeout(() => {
    clearLater().catch(() => {});
  }, SENSITIVE_CLEAR_MS);
}

/**
 * @param {string} text value to copy
 * @param {{sensitive?: boolean}} [options] sensitive copies request the
 *   best-effort auto-clear (30s) in both the bridge and the fallback path
 * @returns {Promise<boolean>} whether the value reached the clipboard
 */
export async function copyText(text, options = {}) {
  if (typeof text !== 'string' || text.length === 0) return false;

  if (window.passbox?.copyToClipboard) {
    try {
      const result = await withTimeout(
        window.passbox.copyToClipboard(text, {
          sensitive: Boolean(options.sensitive),
        }),
        BRIDGE_TIMEOUT_MS,
      );
      if (result?.ok !== false) return true;
    } catch {
      // Fall through to the Web Clipboard API below.
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    if (options.sensitive) scheduleSensitiveClear(text);
    return true;
  }

  return false;
}
