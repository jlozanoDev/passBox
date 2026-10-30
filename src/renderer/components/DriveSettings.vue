<script setup>
import { onMounted, ref } from 'vue';

const emit = defineEmits(['changed']);

const status = ref({ hasCredentials: false, connected: false });
const clientId = ref('');
const clientSecret = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');

async function refresh() {
  status.value = await window.passbox.driveStatus();
}

onMounted(refresh);

async function saveCredentials() {
  error.value = '';
  message.value = '';
  try {
    await window.passbox.driveSetCredentials({
      clientId: clientId.value.trim(),
      clientSecret: clientSecret.value.trim(),
    });
    clientId.value = '';
    clientSecret.value = '';
    message.value = 'Credentials saved.';
    await refresh();
    emit('changed');
  } catch (err) {
    error.value = err?.message ?? 'Could not save credentials.';
  }
}

async function connect() {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await window.passbox.driveConnect();
    message.value = 'Google Drive connected.';
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
  await window.passbox.driveDisconnect();
  message.value = 'Disconnected.';
  await refresh();
  emit('changed');
}
</script>

<template>
  <section class="rounded-xl border border-neutral-200 bg-white p-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-neutral-900">Google Drive</h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{
            status.connected
              ? 'Vault sync is connected.'
              : 'Bring your own OAuth client (Desktop app).'
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

    <form
      v-if="!status.hasCredentials"
      class="mt-3 space-y-2"
      @submit.prevent="saveCredentials"
    >
      <input
        v-model="clientId"
        required
        placeholder="OAuth Client ID"
        class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      <input
        v-model="clientSecret"
        required
        type="password"
        placeholder="OAuth Client Secret"
        class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      <button
        type="submit"
        class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Save credentials
      </button>
      <p class="text-xs text-neutral-400">
        Google Cloud Console → Credentials → OAuth client ID → Desktop app.
      </p>
    </form>

    <div v-else-if="!status.connected" class="mt-3">
      <button
        type="button"
        :disabled="busy"
        class="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        @click="connect"
      >
        {{ busy ? 'Waiting for Google…' : 'Connect Google Drive' }}
      </button>
    </div>

    <div v-else class="mt-3">
      <button
        type="button"
        class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        @click="disconnect"
      >
        Disconnect
      </button>
    </div>

    <p v-if="message" class="mt-2 text-xs text-green-600">{{ message }}</p>
    <p v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</p>
  </section>
</template>
