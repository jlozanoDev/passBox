import { computed, ref } from 'vue';

const STORAGE_KEY = 'passbox.theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

const preference = ref('system');
const systemDark = ref(false);
let mediaQuery = null;
let initialized = false;

function storedPreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system'
      ? value
      : 'system';
  } catch {
    return 'system';
  }
}

function apply() {
  const dark =
    preference.value === 'dark' ||
    (preference.value === 'system' && systemDark.value);
  document.documentElement.classList.toggle('dark', dark);
}

function onSystemChange(event) {
  systemDark.value = event.matches;
  if (preference.value === 'system') apply();
}

export function initTheme() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  preference.value = storedPreference();
  mediaQuery = window.matchMedia(MEDIA_QUERY);
  systemDark.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', onSystemChange);
  apply();
}

export function useTheme() {
  const resolved = computed(() =>
    preference.value === 'system'
      ? systemDark.value
        ? 'dark'
        : 'light'
      : preference.value,
  );

  function setPreference(value) {
    if (value !== 'light' && value !== 'dark' && value !== 'system') return;
    preference.value = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Persistence is a convenience; the applied theme still works.
    }
    apply();
  }

  return { preference, resolved, setPreference };
}
