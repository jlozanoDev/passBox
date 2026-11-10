/**
 * Strip Vue reactivity before an object crosses the IPC boundary.
 *
 * Electron serializes IPC arguments with the structured clone algorithm,
 * which rejects Proxy objects with "An object could not be cloned". Vue
 * hands out proxies for anything held in a `reactive`/`ref` container, so
 * a payload built from `vault.value` (as `[...items.value]` does) fails
 * unless it is flattened first.
 *
 * The vault payload is a plain JSON document (S10 schema) — every field is
 * a string, boolean, or array of those — so a JSON round-trip is lossless
 * and also gives the caller an independent copy to mutate safely.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}
