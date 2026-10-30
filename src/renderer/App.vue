<script setup>
import { computed, ref } from 'vue';
import SearchBar from './components/SearchBar.vue';
import SecretList from './components/SecretList.vue';
import SecretModal from './components/SecretModal.vue';

// UI-shell state: real vault persistence lands in T4 (encrypted vault + IPC).
const items = ref([
  {
    id: crypto.randomUUID(),
    title: 'Stripe Production API Key',
    category: 'api_token',
    username: 'admin@project.com',
    secret: 'sk_live_51M...',
    notes: 'Usar solo en entornos productivos de pasarela de pagos.',
    createdAt: '2026-10-30T20:00:00.000Z',
    updatedAt: '2026-10-30T20:00:00.000Z',
  },
]);

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

function openCreate() {
  editingItem.value = null;
  modalOpen.value = true;
}

function openEdit(item) {
  editingItem.value = item;
  modalOpen.value = true;
}

function saveItem({ title, username, secret, category, notes }) {
  const now = new Date().toISOString();
  if (editingItem.value) {
    const target = items.value.find((i) => i.id === editingItem.value.id);
    if (target) {
      Object.assign(target, {
        title,
        username,
        secret,
        category,
        notes,
        updatedAt: now,
      });
    }
  } else {
    items.value.push({
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
  modalOpen.value = false;
}

function deleteItem(item) {
  items.value = items.value.filter((i) => i.id !== item.id);
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <header class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight text-neutral-900">
        Passbox
      </h1>
      <button
        type="button"
        class="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        @click="openCreate"
      >
        + New secret
      </button>
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
  </div>
</template>
