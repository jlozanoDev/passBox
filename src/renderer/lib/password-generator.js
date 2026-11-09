/**
 * Password generation with a real CSPRNG (Web Crypto).
 *
 * Guarantees: the requested length, at least one character from every
 * enabled class, and no modulo bias (rejection sampling). This module
 * never logs, stores or transmits the generated value.
 */

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

export const CHARACTER_SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/|~',
};

export const DEFAULT_GENERATOR_OPTIONS = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
};

function secureRandomInt(max) {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) {
    throw new Error('A secure random source is unavailable');
  }
  const range = 0x100000000;
  const limit = Math.floor(range / max) * max;
  const buffer = new Uint32Array(1);
  let value = limit;
  while (value >= limit) {
    source.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % max;
}

function shuffle(chars) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

function resolveLength(length) {
  const numeric = Number.isFinite(length)
    ? Math.trunc(length)
    : DEFAULT_GENERATOR_OPTIONS.length;
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, numeric));
}

/**
 * @param {{length?: number, upper?: boolean, lower?: boolean,
 *   digits?: boolean, symbols?: boolean}} [options]
 * @returns {string}
 */
export function generatePassword(options = {}) {
  const settings = { ...DEFAULT_GENERATOR_OPTIONS, ...options };
  const enabledSets = Object.keys(CHARACTER_SETS)
    .filter((key) => settings[key])
    .map((key) => CHARACTER_SETS[key]);

  if (enabledSets.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const length = resolveLength(settings.length);
  const pool = enabledSets.join('');
  const chars = enabledSets.map((set) => set[secureRandomInt(set.length)]);
  while (chars.length < length) {
    chars.push(pool[secureRandomInt(pool.length)]);
  }

  return shuffle(chars).join('');
}
