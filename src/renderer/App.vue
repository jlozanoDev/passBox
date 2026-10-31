<script setup>
import { computed, onMounted, ref } from 'vue';
import SearchBar from './components/SearchBar.vue';
import SecretList from './components/SecretList.vue';
import SecretModal from './components/SecretModal.vue';
import UnlockScreen from './components/UnlockScreen.vue';
import CloudSettings from './components/CloudSettings.vue';

const ready = ref(false);
const unlocked = ref(false);
const unlockMode = ref('unlock'); // 'create' | 'unlock'

/** @type {ref<object>} decrypted vault payload (S10 schema), main-process owned on disk */
const vault = ref(null);

const items = computed(() => vault.value?.items ?? []);

const searchQuery = ref('');
const modalOpen = ref(false);
const editingItem = ref(null);

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return items.value;
  return items.value.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      item.username.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query),
  );
});

onMounted(async () => {
  const status = await window.passbox.vaultStatus();
  unlockMode.value = status.exists ? 'unlock' : 'create';
  ready.value = true;
});

function onAuthenticated(payload) {
  vault.value = payload;
  unlocked.value = true;
}

async function persist() {
  vault.value = await window.passbox.vaultSave(vault.value);
}

function openCreate() {
  editingItem.value = null;
  modalOpen.value = true;
}

function openEdit(item) {
  editingItem.value = item;
  modalOpen.value = true;
}

async function saveItem({ title, username, secret, category, notes }) {
  const now = new Date().toISOString();
  const list = [...vault.value.items];
  if (editingItem.value) {
    const index = list.findIndex((i) => i.id === editingItem.value.id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        title,
        username,
        secret,
        category,
        notes,
        updatedAt: now,
      };
    }
  } else {
    list.push({
      id: crypto.randomUUID(),
      title,
      username,
      secret,
      category,
      notes,
      createdAt: now,
      updatedAt: now,
    });
  }
  vault.value = { ...vault.value, items: list };
  await persist();
  modalOpen.value = false;
}

async function deleteItem(item) {
  vault.value = {
    ...vault.value,
    items: vault.value.items.filter((i) => i.id !== item.id),
  };
  await persist();
}

async function lock() {
  await window.passbox.vaultLock();
  vault.value = null;
  unlocked.value = false;
  unlockMode.value = 'unlock';
}
</script>

<template>
  <UnlockScreen
    v-if="ready && !unlocked"
    :mode="unlockMode"
    @authenticated="onAuthenticated"
  />

  <div v-else-if="unlocked" class="mx-auto max-w-2xl px-4 py-8">
    <header class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight text-neutral-900">
        Passbox
      </h1>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          @click="lock"
        >
          Lock
        </button>
        <button
          type="button"
          class="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          @click="openCreate"
        >
          + New secret
        </button>
      </div>
    </header>

    <div class="mt-4">
      <SearchBar v-model="searchQuery" />
    </div>

    <main
      class="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      <SecretList
        :items="filteredItems"
        @edit="openEdit"
        @delete="deleteItem"
      />
    </main>

    <SecretModal
      :open="modalOpen"
      :item="editingItem"
      @save="saveItem"
      @cancel="modalOpen = false"
    />

    <aside class="mt-6">
      <CloudSettings />
    </aside>
  </div>
</template>
