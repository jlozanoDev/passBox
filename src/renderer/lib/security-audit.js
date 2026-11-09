/**
 * Local-only security assessment for the vault.
 *
 * This is a documented heuristic, never a guarantee, and it never leaves
 * the renderer: it only reads the already-decrypted in-memory items and
 * returns identifiers and counts. Secret values are never included in
 * the result and never logged.
 */

export const STALE_AFTER_DAYS = 180;

export const STRENGTH_LABELS = [
  'Muy débil',
  'Débil',
  'Aceptable',
  'Fuerte',
  'Excelente',
];

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'abc123',
  'letmein',
  'letmein123',
  'welcome',
  'admin',
  'admin123',
  'iloveyou',
  'monkey',
  'dragon',
  'passw0rd',
  'changeme',
  'secret',
  'master',
  'root',
  'toor',
  'test',
  'guest',
  '111111',
  '000000',
]);

function charsetSize(secret) {
  let size = 0;
  if (/[a-z]/.test(secret)) size += 26;
  if (/[A-Z]/.test(secret)) size += 26;
  if (/[0-9]/.test(secret)) size += 10;
  if (/[^a-zA-Z0-9]/.test(secret)) size += 33;
  return size;
}

function isRepeatedPattern(secret) {
  const maxUnit = Math.min(4, Math.floor(secret.length / 2));
  for (let unit = 1; unit <= maxUnit; unit += 1) {
    if (secret.length % unit !== 0) continue;
    if (secret === secret.slice(0, unit).repeat(secret.length / unit)) {
      return true;
    }
  }
  return false;
}

function scoreFromBits(bits) {
  if (bits < 38) return 0;
  if (bits < 52) return 1;
  if (bits < 70) return 2;
  if (bits < 95) return 3;
  return 4;
}

/**
 * Heuristic strength estimate for one secret.
 * @param {string} secret
 * @returns {{score: number, label: string, bits: number, weak: boolean}}
 */
export function estimateStrength(secret) {
  const value = typeof secret === 'string' ? secret : '';
  if (value.length === 0) {
    return { score: 0, label: STRENGTH_LABELS[0], bits: 0, weak: true };
  }

  const normalized = value.toLowerCase();
  const size = charsetSize(value);
  const bits = Math.round(value.length * Math.log2(Math.max(size, 2)));

  let score = 0;
  if (COMMON_PASSWORDS.has(normalized) || isRepeatedPattern(value)) {
    score = 0;
  } else {
    score = scoreFromBits(bits);
    // A short, single-case password is always weak regardless of raw bits.
    if (size <= 26 && value.length < 16) {
      score = Math.min(score, 1);
    }
    if (value.length < 8) {
      score = 0;
    }
  }

  return {
    score,
    label: STRENGTH_LABELS[score],
    bits,
    weak: score <= 1,
  };
}

/**
 * Whole-vault assessment. Returns identifiers and counts only.
 * Items that store no secret (notes) are excluded from strength scoring: they
 * cannot be weak or reused, so counting them would distort the average.
 * @param {Array<object>} items
 * @param {number} [now] epoch ms, injectable for tests
 * @returns {{total: number, favorites: number, assessed: number,
 *   weak: string[], reused: Array<{ids: string[], count: number}>,
 *   stale: string[], averageScore: number}}
 */
export function auditVault(items, now = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  const weak = [];
  const stale = [];
  const bySecret = new Map();
  let favorites = 0;
  let scoreSum = 0;
  let assessed = 0;

  for (const item of list) {
    const secret = typeof item?.secret === 'string' ? item.secret : '';
    if (item?.favorite) favorites += 1;

    if (secret.length > 0) {
      const strength = estimateStrength(secret);
      scoreSum += strength.score;
      assessed += 1;
      if (strength.weak) weak.push(item.id);

      const ids = bySecret.get(secret) ?? [];
      ids.push(item.id);
      bySecret.set(secret, ids);
    }

    const updated = Date.parse(item?.updatedAt ?? '');
    if (
      Number.isFinite(updated) &&
      now - updated > STALE_AFTER_DAYS * 86400000
    ) {
      stale.push(item.id);
    }
  }

  const reused = [...bySecret.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ ids, count: ids.length }));

  return {
    total: list.length,
    favorites,
    assessed,
    weak,
    reused,
    stale,
    averageScore:
      assessed === 0 ? 0 : Math.round((scoreSum / assessed) * 10) / 10,
  };
}
