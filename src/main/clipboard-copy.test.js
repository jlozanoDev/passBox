import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SENSITIVE_CLEAR_MS,
  createClipboardService,
  fingerprint,
} from './clipboard.js';

const here = dirname(fileURLToPath(import.meta.url));
const SECRET = 'SYNTHETIC-CANARY-4f19a2';

function harness() {
  const timers = [];
  const clipboard = { text: '', cleared: 0, writes: [] };
  const service = createClipboardService({
    clipboard: {
      writeText: (value) => {
        clipboard.text = value;
        clipboard.writes.push(value);
      },
      readText: () => clipboard.text,
      clear: () => {
        clipboard.cleared += 1;
        clipboard.text = '';
      },
    },
    setTimer: (fn, ms) => {
      const timer = {
        ms,
        cleared: false,
        // The original callback, kept for source-level assertions.
        callback: fn,
        unref() {},
        // Models clearTimeout: a cancelled timer never runs.
        fn: () => {
          if (!timer.cleared) fn();
        },
      };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      if (timer) timer.cleared = true;
    },
  });
  return { service, timers, clipboard };
}

describe('fingerprint', () => {
  it('is the SHA-256 of the value', () => {
    expect(fingerprint(SECRET)).toBe(
      createHash('sha256').update(SECRET, 'utf8').digest('hex'),
    );
  });
});

describe('clipboard service (S10, S15)', () => {
  it('writes the value and schedules a 30s auto-clear for sensitive copies', () => {
    const { service, timers, clipboard } = harness();
    expect(service.copy(SECRET, { sensitive: true })).toEqual({ ok: true });
    expect(clipboard.writes).toEqual([SECRET]);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(SENSITIVE_CLEAR_MS);
    expect(SENSITIVE_CLEAR_MS).toBe(30_000);
  });

  it('never captures the plaintext in the scheduled callback', () => {
    const { service, timers } = harness();
    service.copy(SECRET, { sensitive: true });
    const source = timers[0].callback.toString();
    expect(source).not.toContain(SECRET);
    expect(source).toContain('fingerprint(');
  });

  it('clears only while the clipboard still holds the copied value', () => {
    const unchanged = harness();
    unchanged.service.copy(SECRET, { sensitive: true });
    unchanged.timers[0].fn();
    expect(unchanged.clipboard.cleared).toBe(1);

    const replaced = harness();
    replaced.service.copy(SECRET, { sensitive: true });
    replaced.clipboard.text = 'SOMETHING-ELSE-999';
    replaced.timers[0].fn();
    expect(replaced.clipboard.cleared).toBe(0);
  });

  it('does not schedule an auto-clear for non-sensitive copies', () => {
    const { service, timers } = harness();
    expect(service.copy('plain-user-name')).toEqual({ ok: true });
    expect(timers).toHaveLength(0);
  });

  it('rejects empty and non-string values without writing', () => {
    const { service, timers, clipboard } = harness();
    for (const bad of ['', null, undefined, 12345, {}]) {
      expect(service.copy(bad, { sensitive: true })).toEqual({ ok: false });
    }
    expect(clipboard.writes).toHaveLength(0);
    expect(timers).toHaveLength(0);
  });

  it('replaces a pending timer on a second sensitive copy', () => {
    const { service, timers } = harness();
    service.copy('FIRST-SECRET-1', { sensitive: true });
    service.copy('SECOND-SECRET-2', { sensitive: true });
    expect(timers[0].cleared).toBe(true);
    expect(timers.filter((timer) => !timer.cleared)).toHaveLength(1);
  });

  it('drops the pending clear on flush (before-quit path)', () => {
    const { service, timers, clipboard } = harness();
    service.copy(SECRET, { sensitive: true });
    const pending = timers[0];
    service.flush();
    expect(pending.cleared).toBe(true);
    pending.fn();
    expect(clipboard.cleared).toBe(0);
  });
});

describe('IPC channel contract (S12, S15)', () => {
  const mainSource = readFileSync(join(here, '..', 'main.js'), 'utf8');
  const channels = [...mainSource.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(
    (match) => match[1],
  );

  it('keeps every baseline channel and adds only clipboard:copy', () => {
    for (const channel of [
      'vault:status',
      'vault:create',
      'vault:unlock',
      'vault:save',
      'vault:lock',
      'cloud:status',
      'cloud:connect',
      'cloud:disconnect',
      'cloud:sync-status',
    ]) {
      expect(channels, channel).toContain(channel);
    }
    expect(channels).toContain('clipboard:copy');
    expect(channels).toHaveLength(10);
  });

  it('flushes the clipboard service on before-quit (S10, S15)', () => {
    expect(mainSource).toMatch(
      /before-quit[\s\S]{0,400}clipboardService\.flush\(\)/,
    );
  });
});
