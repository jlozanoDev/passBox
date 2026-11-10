import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { toPlain } from './ipc-payload.js';

describe('toPlain (IPC boundary)', () => {
  it('makes a reactive vault payload structured-cloneable', () => {
    const vault = reactive({
      version: '1.0.0',
      salt: 'c2FsdA==',
      items: [{ id: 'item-1', title: 'GitHub', favorite: true }],
    });

    // What the renderer used to send: the same object shape produced by
    // `[...items.value]`. Electron serializes IPC arguments with the
    // structured clone algorithm, which rejects Vue proxies.
    const payload = { ...vault, items: [...vault.items] };
    expect(() => structuredClone(payload)).toThrow();

    expect(() => structuredClone(toPlain(payload))).not.toThrow();
  });

  it('preserves the payload content unchanged', () => {
    const payload = {
      version: '1.0.0',
      salt: 'c2FsdA==',
      updatedAt: '2026-11-09T16:58:51.123Z',
      items: [
        { id: 'item-1', title: 'GitHub', username: 'jlozano', favorite: true },
      ],
    };

    expect(toPlain(payload)).toEqual(payload);
  });

  it('returns independent objects so later edits cannot leak back', () => {
    const payload = { items: [{ id: 'item-1', title: 'GitHub' }] };
    const plain = toPlain(payload);

    plain.items[0].title = 'Changed';

    expect(payload.items[0].title).toBe('GitHub');
  });
});
