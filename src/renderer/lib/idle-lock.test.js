import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIdleLock } from './idle-lock.js';

describe('startIdleLock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks after the inactivity timeout', () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const onIdle = vi.fn();

    startIdleLock(onIdle, { target, timeoutMs: 60_000 });

    vi.advanceTimersByTime(59_999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('restarts the timeout after user activity', () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const onIdle = vi.fn();

    startIdleLock(onIdle, { target, timeoutMs: 60_000 });

    vi.advanceTimersByTime(30_000);
    target.dispatchEvent(new Event('pointermove'));
    vi.advanceTimersByTime(30_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('stops the timer and removes activity listeners when disposed', () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const onIdle = vi.fn();
    const stop = startIdleLock(onIdle, { target, timeoutMs: 60_000 });

    stop();
    target.dispatchEvent(new Event('pointermove'));
    vi.advanceTimersByTime(60_000);

    expect(onIdle).not.toHaveBeenCalled();
  });
});
