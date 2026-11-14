const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
];

export function startIdleLock(
  onIdle,
  { timeoutMs = 60_000, target = globalThis.window } = {},
) {
  if (typeof onIdle !== 'function' || !target) return () => {};

  let timer;
  let stopped = false;
  let expired = false;

  function resetTimer() {
    if (stopped || expired) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      expired = true;
      onIdle();
    }, timeoutMs);
  }

  for (const eventName of ACTIVITY_EVENTS) {
    target.addEventListener(eventName, resetTimer, { passive: true });
  }
  resetTimer();

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const eventName of ACTIVITY_EVENTS) {
      target.removeEventListener(eventName, resetTimer);
    }
  };
}
