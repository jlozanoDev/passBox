<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  mode: {
    type: String,
    required: true, // 'create' | 'unlock'
  },
});

const emit = defineEmits(['authenticated']);

const password = ref('');
const confirmation = ref('');
const error = ref('');
const busy = ref(false);

const isCreate = computed(() => props.mode === 'create');

async function submit() {
  error.value = '';

  if (isCreate.value) {
    if (password.value.length < 8) {
      error.value = 'Master password must be at least 8 characters.';
      return;
    }
    if (password.value !== confirmation.value) {
      error.value = 'Passwords do not match.';
      return;
    }
  }

  if (!password.value) {
    error.value = 'Enter your master password.';
    return;
  }

  busy.value = true;
  try {
    const payload = isCreate.value
      ? await window.passbox.vaultCreate(password.value)
      : await window.passbox.vaultUnlock(password.value);
    emit('authenticated', payload);
  } catch {
    error.value = 'Wrong master password.';
  } finally {
    busy.value = false;
    password.value = '';
    confirmation.value = '';
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
    <form
      class="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      @submit.prevent="submit"
    >
      <h1 class="text-lg font-semibold text-neutral-900">Passbox</h1>
      <p class="mt-1 text-sm text-neutral-500">
        {{
          isCreate
            ? 'Create a master password to initialize your vault.'
            : 'Enter your master password to unlock.'
        }}
      </p>

      <label class="mt-4 block">
        <span class="text-xs font-medium text-neutral-600"
          >Master password</span
        >
        <input
          v-model="password"
          type="password"
          autofocus
          autocomplete="off"
          class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </label>

      <label v-if="isCreate" class="mt-3 block">
        <span class="text-xs font-medium text-neutral-600">Confirm</span>
        <input
          v-model="confirmation"
          type="password"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </label>

      <p v-if="error" class="mt-3 text-xs text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="busy"
        class="mt-5 w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {{ busy ? 'Working…' : isCreate ? 'Create vault' : 'Unlock' }}
      </button>
    </form>
  </div>
</template>
