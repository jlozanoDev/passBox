import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_DAYS,
  auditVault,
  estimateStrength,
} from './security-audit.js';

function item(overrides) {
  return {
    id: 'id-1',
    title: 'Example',
    username: 'user@example.com',
    secret: 'Tr0ub4dour&3xpl0it!',
    category: 'password',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('estimateStrength', () => {
  it('flags common passwords as very weak', () => {
    const result = estimateStrength('password');
    expect(result.score).toBe(0);
    expect(result.weak).toBe(true);
    expect(result.label).toBe('Muy débil');
  });

  it('flags short passwords as weak', () => {
    const result = estimateStrength('Ab1!');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.weak).toBe(true);
  });

  it('flags repeated patterns even when long', () => {
    const result = estimateStrength('aaaaaaaaaaaaaaaa');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.weak).toBe(true);
  });

  it('rates a long mixed password as strong or better', () => {
    const result = estimateStrength('Tr0ub4dour&3xpl0it!');
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.weak).toBe(false);
  });

  it('treats an empty secret as very weak', () => {
    expect(estimateStrength('').score).toBe(0);
  });
});

describe('auditVault', () => {
  const now = Date.UTC(2026, 10, 9);

  it('returns a neutral audit for an empty vault', () => {
    const audit = auditVault([], now);
    expect(audit.total).toBe(0);
    expect(audit.weak).toEqual([]);
    expect(audit.reused).toEqual([]);
    expect(audit.stale).toEqual([]);
  });

  it('counts credentials, favorites and strengths', () => {
    const audit = auditVault(
      [
        item({ id: 'a', favorite: true }),
        item({ id: 'b', secret: 'N7#vR2!qL9@wT4$z' }),
      ],
      now,
    );
    expect(audit.total).toBe(2);
    expect(audit.favorites).toBe(1);
    expect(audit.averageScore).toBeGreaterThan(0);
  });

  it('reports reused secrets by id without exposing the secret', () => {
    const audit = auditVault(
      [
        item({ id: 'a', secret: 'SharedSecret#2026' }),
        item({ id: 'b', secret: 'SharedSecret#2026' }),
        item({ id: 'c', secret: 'UniqueSecret#2026' }),
      ],
      now,
    );
    expect(audit.reused).toHaveLength(1);
    expect(audit.reused[0].ids.sort()).toEqual(['a', 'b']);
    expect(audit.reused[0].count).toBe(2);
    expect(JSON.stringify(audit)).not.toContain('SharedSecret#2026');
  });

  it('reports weak and stale credentials', () => {
    const audit = auditVault(
      [
        item({ id: 'weak', secret: 'password' }),
        item({
          id: 'stale',
          secret: 'K9$mQ2!xV7@bR4#n',
          updatedAt: new Date(
            now - (STALE_AFTER_DAYS + 5) * 86400000,
          ).toISOString(),
        }),
      ],
      now,
    );
    expect(audit.weak).toContain('weak');
    expect(audit.stale).toContain('stale');
    expect(audit.weak).not.toContain('stale');
  });

  it('ignores empty secrets when detecting reuse', () => {
    const audit = auditVault(
      [item({ id: 'a', secret: '' }), item({ id: 'b', secret: '' })],
      now,
    );
    expect(audit.reused).toEqual([]);
  });

  it('does not flag items without a secret as weak', () => {
    const audit = auditVault(
      [
        item({ id: 'note', category: 'note', secret: '' }),
        item({ id: 'strong' }),
      ],
      now,
    );
    expect(audit.weak).toEqual([]);
  });

  it('averages strength only across items that store a secret', () => {
    const strong = 'N7#vR2!qL9@wT4$z';
    const audit = auditVault(
      [
        item({ id: 'note', secret: '' }),
        item({ id: 'strong', secret: strong }),
      ],
      now,
    );
    expect(audit.assessed).toBe(1);
    expect(audit.averageScore).toBe(estimateStrength(strong).score);
  });
});
