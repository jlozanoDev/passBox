import { reactive } from 'vue';

const toasts = reactive([]);
const timers = new Map();
let counter = 0;
const MAX_VISIBLE = 4;

function dismiss(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const index = toasts.findIndex((entry) => entry.id === id);
  if (index !== -1) toasts.splice(index, 1);
}

/**
 * Queue a short, non-blocking confirmation. Never pass secret values here.
 * @param {string} message
 * @param {{tone?: 'default'|'success'|'error'|'secure', duration?: number}} [options]
 */
function toast(message, options = {}) {
  const { tone = 'default', duration = 2600 } = options;
  const id = ++counter;
  toasts.push({ id, message, tone });
  while (toasts.length > MAX_VISIBLE) {
    dismiss(toasts[0].id);
  }
  timers.set(
    id,
    setTimeout(() => dismiss(id), duration),
  );
  return id;
}

export function useToast() {
  return { toasts, toast, dismiss };
}
