<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import SearchBar from './components/SearchBar.vue';
import SecretList from './components/SecretList.vue';
import SecretModal from './components/SecretModal.vue';
import UnlockScreen from './components/UnlockScreen.vue';
import SidebarNav from './components/SidebarNav.vue';
import DetailPanel from './components/DetailPanel.vue';
import GeneratorView from './components/GeneratorView.vue';
import SecurityView from './components/SecurityView.vue';
import SettingsView from './components/SettingsView.vue';
import AppIcon from './components/ui/AppIcon.vue';
import BrandMark from './components/ui/BrandMark.vue';
import ToastHost from './components/ui/ToastHost.vue';
import ConfirmDialog from './components/ui/ConfirmDialog.vue';
import { CATEGORY_LABELS } from './lib/icons.js';
import { copyText } from './lib/clipboard.js';
import { useToast } from './composables/useToast.js';

const views = [
  {
    id: 'vault',
    label: 'Bóveda',
    icon: 'key',
    title: 'Bóveda',
    subtitle: 'Busca, abre y gestiona tus credenciales.',
  },
  {
    id: 'generator',
    label: 'Generador',
    icon: 'wand',
    title: 'Generador de contraseñas',
    subtitle: 'Crea contraseñas seguras en local.',
  },
  {
    id: 'security',
    label: 'Seguridad',
    icon: 'shieldCheck',
    title: 'Centro de seguridad',
    subtitle: 'Evaluación local de tu bóveda.',
  },
  {
    id: 'settings',
    label: 'Ajustes',
    icon: 'settings',
    title: 'Ajustes',
    subtitle: 'Apariencia, sincronización y control de la bóveda.',
  },
];

const categoryOrder = ['password', 'api_token', 'database', 'note', 'other'];

const { toast } = useToast();

const ready = ref(false);
const unlocked = ref(false);
const unlockMode = ref('unlock'); // 'create' | 'unlock'

/** @type {import('vue').Ref<object|null>} decrypted vault payload (S10 schema) */
const vault = ref(null);

const items = computed(() => vault.value?.items ?? []);

const activeView = ref('vault');
const searchQuery = ref('');
const filter = ref('all');
const selectedId = ref(null);
const modalOpen = ref(false);
const editingItem = ref(null);
const pendingDelete = ref(null);
const searchRef = ref(null);

const currentView = computed(
  () => views.find((view) => view.id === activeView.value) ?? views[0],
);

const favoritesCount = computed(
  () => items.value.filter((item) => item.favorite).length,
);

const headerSubtitle = computed(() => {
  if (activeView.value !== 'vault') return currentView.value.subtitle;
  const total = items.value.length;
  if (total === 0) return 'Añade tu primera credencial para empezar.';
  const favorites = favoritesCount.value;
  return `${total} credencial${total === 1 ? '' : 'es'} · ${favorites} favorita${favorites === 1 ? '' : 's'}`;
});

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  let list = [...items.value];

  if (filter.value === 'favorites') {
    list = list.filter((item) => item.favorite);
  } else if (filter.value !== 'all') {
    list = list.filter((item) => item.category === filter.value);
  }

  if (query) {
    list = list.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        (item.username ?? '').toLowerCase().includes(query) ||
        (item.category ?? '').toLowerCase().includes(query),
    );
  }

  return list.sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  );
});

const selectedItem = computed(
  () => items.value.find((item) => item.id === selectedId.value) ?? null,
);

const filters = computed(() => {
  const options = [
    { value: 'all', label: 'Todas', count: items.value.length },
    { value: 'favorites', label: 'Favoritas', count: favoritesCount.value },
  ];
  for (const category of categoryOrder) {
    const count = items.value.filter(
      (item) => item.category === category,
    ).length;
    if (count > 0) {
      options.push({
        value: category,
        label: CATEGORY_LABELS[category] ?? category,
        count,
      });
    }
  }
  return options;
});

const filterLabel = computed(() => {
  if (searchQuery.value.trim()) return 'Resultados de búsqueda';
  if (filter.value === 'all') return 'Todas las credenciales';
  if (filter.value === 'favorites') return 'Favoritas';
  return CATEGORY_LABELS[filter.value] ?? 'Credenciales';
});

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown);
  const status = await window.passbox.vaultStatus();
  unlockMode.value = status.exists ? 'unlock' : 'create';
  ready.value = true;
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});

function onGlobalKeydown(event) {
  if (!unlocked.value) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    activeView.value = 'vault';
    nextTick(() => searchRef.value?.focus());
    return;
  }
  if (event.key === 'Escape') {
    if (modalOpen.value) {
      modalOpen.value = false;
      return;
    }
    if (pendingDelete.value) {
      pendingDelete.value = null;
      return;
    }
    if (selectedId.value) selectedId.value = null;
  }
}

function onAuthenticated(payload) {
  vault.value = payload;
  unlocked.value = true;
  activeView.value = 'vault';
  selectedId.value = null;
  searchQuery.value = '';
  filter.value = 'all';
}

async function persist(payload) {
  const saved = await window.passbox.vaultSave(payload);
  vault.value = saved;
  return saved;
}

function openCreate() {
  activeView.value = 'vault';
  editingItem.value = null;
  modalOpen.value = true;
}

function openEdit(item) {
  editingItem.value = item;
  modalOpen.value = true;
}

async function saveItem(data) {
  const now = new Date().toISOString();
  const list = [...items.value];
  const isEditing = Boolean(editingItem.value);
  let savedId = editingItem.value?.id ?? null;

  if (editingItem.value) {
    const index = list.findIndex((item) => item.id === editingItem.value.id);
    if (index !== -1) {
      list[index] = { ...list[index], ...data, updatedAt: now };
    }
  } else {
    savedId = crypto.randomUUID();
    list.push({
      id: savedId,
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await persist({ ...vault.value, items: list });
    modalOpen.value = false;
    editingItem.value = null;
    activeView.value = 'vault';
    selectedId.value = savedId;
    toast(isEditing ? 'Credencial actualizada' : 'Credencial guardada', {
      tone: 'success',
    });
  } catch {
    toast('No se pudo guardar la bóveda', { tone: 'error' });
  }
}

async function toggleFavorite(item) {
  const list = items.value.map((entry) =>
    entry.id === item.id
      ? { ...entry, favorite: !entry.favorite, updatedAt: entry.updatedAt }
      : entry,
  );
  try {
    await persist({ ...vault.value, items: list });
  } catch {
    toast('No se pudieron actualizar las favoritas', { tone: 'error' });
  }
}

function requestDelete(item) {
  pendingDelete.value = item;
}

async function confirmDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  const list = items.value.filter((entry) => entry.id !== item.id);
  try {
    await persist({ ...vault.value, items: list });
    if (selectedId.value === item.id) selectedId.value = null;
    pendingDelete.value = null;
    toast('Credencial eliminada');
  } catch {
    toast('No se pudo eliminar la credencial', { tone: 'error' });
  }
}

async function copySecret(item) {
  if (!item.secret) {
    toast('No hay ningún secreto guardado en esta credencial', {
      tone: 'error',
    });
    return;
  }
  const ok = await copyText(item.secret, { sensitive: true });
  toast(
    ok ? 'Secreto copiado · se borra en 30 s' : 'Portapapeles no disponible',
    {
      tone: ok ? 'secure' : 'error',
    },
  );
}

function selectItem(item) {
  selectedId.value = item.id;
}

function clearFilters() {
  searchQuery.value = '';
  filter.value = 'all';
}

function openFromSecurity(id) {
  activeView.value = 'vault';
  searchQuery.value = '';
  filter.value = 'all';
  selectedId.value = id;
}

async function lock() {
  await window.passbox.vaultLock();
  vault.value = null;
  unlocked.value = false;
  unlockMode.value = 'unlock';
  modalOpen.value = false;
  pendingDelete.value = null;
  selectedId.value = null;
  searchQuery.value = '';
  filter.value = 'all';
  toast('Bóveda bloqueada');
}
</script>

<template>
  <div v-if="!ready" class="grid h-screen place-items-center bg-canvas">
    <div class="flex flex-col items-center gap-3">
      <span
        class="grid size-11 place-items-center rounded-[10px] bg-ink text-canvas"
      >
        <BrandMark :size="24" />
      </span>
      <span class="skeleton h-2 w-24" />
    </div>
  </div>

  <UnlockScreen
    v-else-if="!unlocked"
    :mode="unlockMode"
    @authenticated="onAuthenticated"
  />

  <div v-else class="flex h-screen overflow-hidden bg-canvas">
    <SidebarNav
      :views="views"
      :active="activeView"
      :item-count="items.length"
      @select="activeView = $event"
      @lock="lock"
    />

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-2.5 sm:hidden">
          <span
            class="grid size-7 shrink-0 place-items-center rounded-[7px] bg-ink text-canvas"
          >
            <BrandMark :size="15" />
          </span>
          <span class="truncate text-[13px] font-semibold text-ink">
            {{ currentView.label }}
          </span>
        </div>

        <div class="hidden min-w-0 sm:block">
          <h1 class="pb-title truncate">{{ currentView.title }}</h1>
          <p class="truncate text-[11px] text-faint">{{ headerSubtitle }}</p>
        </div>

        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            class="btn btn-primary max-sm:size-11 max-sm:px-0"
            @click="openCreate"
          >
            <AppIcon name="plus" :size="14" />
            <span class="max-sm:sr-only">Nueva credencial</span>
          </button>
          <button
            type="button"
            class="row-action sm:hidden"
            aria-label="Bloquear bóveda"
            @click="lock"
          >
            <AppIcon name="lock" :size="15" />
          </button>
        </div>
      </header>

      <main class="min-h-0 flex-1">
        <div v-if="activeView === 'vault'" class="flex h-full min-h-0">
          <section
            class="min-w-0 flex-col border-r border-line bg-surface"
            :class="
              selectedItem
                ? 'hidden lg:flex lg:w-[382px] lg:shrink-0'
                : 'flex w-full lg:w-[382px] lg:shrink-0'
            "
            aria-label="Lista de credenciales"
          >
            <div class="shrink-0 border-b border-line px-3 py-3">
              <SearchBar ref="searchRef" v-model="searchQuery" />
              <div class="scroll-area mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  v-for="option in filters"
                  :key="option.value"
                  type="button"
                  class="chip shrink-0"
                  :class="filter === option.value ? 'chip-active' : ''"
                  :aria-pressed="filter === option.value"
                  @click="filter = option.value"
                >
                  {{ option.label }}
                  <span class="font-mono text-[10px] opacity-60">
                    {{ option.count }}
                  </span>
                </button>
              </div>
            </div>

            <div
              class="flex shrink-0 items-center justify-between px-4 pt-3 pb-1"
            >
              <span class="section-label">{{ filterLabel }}</span>
              <span class="text-[10.5px] text-faint tabular-nums">
                {{ filteredItems.length }}
              </span>
            </div>

            <SecretList
              :items="filteredItems"
              :selected-id="selectedId"
              :total="items.length"
              :query="searchQuery"
              :filter="filter"
              @select="selectItem"
              @edit="openEdit"
              @delete="requestDelete"
              @favorite="toggleFavorite"
              @copy="copySecret"
              @create="openCreate"
              @clear-filters="clearFilters"
            />
          </section>

          <section
            class="min-w-0 flex-1"
            :class="selectedItem ? 'block' : 'hidden lg:block'"
          >
            <DetailPanel
              v-if="selectedItem"
              :item="selectedItem"
              @back="selectedId = null"
              @edit="openEdit"
              @delete="requestDelete"
              @favorite="toggleFavorite"
            />
            <div v-else class="hidden h-full place-items-center lg:grid">
              <div class="px-8 text-center">
                <span
                  class="mx-auto grid size-11 place-items-center rounded-xl border border-line bg-raised text-faint"
                >
                  <AppIcon name="shield" :size="19" />
                </span>
                <p class="mt-4 text-[13px] font-medium text-ink">
                  Selecciona una credencial
                </p>
                <p
                  class="mx-auto mt-1 max-w-[220px] text-[12px] leading-relaxed text-muted"
                >
                  Elige un elemento de la lista para ver, copiar o editar sus
                  detalles.
                </p>
              </div>
            </div>
          </section>
        </div>

        <GeneratorView v-else-if="activeView === 'generator'" />

        <SecurityView
          v-else-if="activeView === 'security'"
          :items="items"
          @open="openFromSecurity"
          @go-vault="activeView = 'vault'"
        />

        <SettingsView
          v-else-if="activeView === 'settings'"
          :item-count="items.length"
          :favorite-count="favoritesCount"
          @lock="lock"
        />
      </main>

      <nav
        class="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Navegación principal"
      >
        <button
          v-for="view in views"
          :key="view.id"
          type="button"
          class="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-150"
          :class="activeView === view.id ? 'text-ink' : 'text-faint'"
          :aria-current="activeView === view.id ? 'page' : undefined"
          @click="activeView = view.id"
        >
          <span
            v-if="activeView === view.id"
            class="absolute inset-x-5 top-0 h-[2px] rounded-full bg-accent"
            aria-hidden="true"
          />
          <AppIcon :name="view.icon" :size="17" />
          {{ view.label }}
        </button>
      </nav>
    </div>

    <SecretModal
      :open="modalOpen"
      :item="editingItem"
      @save="saveItem"
      @cancel="modalOpen = false"
    />

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Eliminar credencial"
      :description="
        pendingDelete
          ? `«${pendingDelete.title}» se eliminará de esta bóveda y de la próxima sincronización. Esta acción no se puede deshacer.`
          : ''
      "
      confirm-label="Eliminar"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />

    <ToastHost />
  </div>
</template>
