<script setup>
import { computed, onMounted, ref } from 'vue';

const emit = defineEmits(['changed']);

const status = ref({
  hasCredentials: false,
  connected: false,
  settings: null,
});
const lastSync = ref(null);
const projectUrl = ref('');
const databaseUrl = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');

async function refresh() {
  const current = await window.passbox.cloudStatus();
  status.value = current;
  if (current.settings) {
    // Prefill non-secret fields only — the secret never round-trips.
    projectUrl.value = current.settings.projectUrl ?? '';
  }
  lastSync.value = (await window.passbox.cloudSyncStatus()).lastSync;
}

// Map recorded sync reasons to plain-language states.
const syncState = computed(() => {
  const entry = lastSync.value;
  if (!entry) return null;
  const { ok, error: reason, at } = entry;
  const when = new Date(at).toLocaleString();
  if (ok) return { tone: 'ok', text: `Last sync: ${when}` };
  if (reason === 'remote-newer') {
    return {
      tone: 'warn',
      text: 'Cloud has newer changes — they merge when you reopen Passbox.',
    };
  }
  if (reason === 'lineage-unverified') {
    return {
      tone: 'warn',
      text: 'Sync resumes after the next successful check on open.',
    };
  }
  return { tone: 'warn', text: `Last sync failed (${when}).` };
});

onMounted(refresh);

async function connect() {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await window.passbox.cloudConnect({
      projectUrl: projectUrl.value.trim(),
      databaseUrl: databaseUrl.value.trim(),
    });
    // Connection string lives encrypted at rest from here on — drop it
    // from renderer memory immediately.
    databaseUrl.value = '';
    message.value = 'Cloud sync connected. Schema is ready.';
    await refresh();
    emit('changed');
  } catch (err) {
    error.value = err?.message ?? 'Connection failed.';
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  error.value = '';
  message.value = '';
  await window.passbox.cloudDisconnect();
  message.value = 'Disconnected.';
  await refresh();
  emit('changed');
}
</script>

<template>
  <section class="rounded-xl border border-neutral-200 bg-white p-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-neutral-900">Cloud sync</h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{
            status.connected
              ? 'Secrets are synced as encrypted rows in Supabase.'
              : 'Supabase project URL and session-pooler connection string.'
          }}
        </p>
      </div>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          status.connected
            ? 'bg-green-100 text-green-700'
            : 'bg-neutral-200 text-neutral-600'
        "
      >
        {{ status.connected ? 'Connected' : 'Not connected' }}
      </span>
    </div>

    <p
      v-if="status.connected && syncState"
      class="mt-2 text-xs"
      :class="syncState.tone === 'ok' ? 'text-neutral-500' : 'text-amber-600'"
    >
      {{ syncState.text }}
    </p>

    <form
      v-if="!status.connected"
      class="mt-3 space-y-2"
      @submit.prevent="connect"
    >
      <input
        v-model="projectUrl"
        required
        placeholder="Project URL (https://xxxx.supabase.co)"
        class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      <input
        v-model="databaseUrl"
        required
        type="password"
        placeholder="Connection string (session pooler)"
        class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      <button
        type="submit"
        :disabled="busy"
        class="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {{ busy ? 'Connecting…' : 'Connect' }}
      </button>
      <p class="text-xs text-neutral-400">
        The connection string is encrypted with your vault key before storage.
        Secret values are encrypted on this device — Supabase only ever stores
        ciphertext.
      </p>
    </form>

    <div v-else class="mt-3">
      <p class="text-xs text-neutral-500">
        {{ status.settings?.projectUrl }}
      </p>
      <button
        type="button"
        class="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        @click="disconnect"
      >
        Disconnect
      </button>
    </div>

    <p v-if="message" class="mt-2 text-xs text-green-600">{{ message }}</p>
    <p v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</p>
  </section>
</template>
