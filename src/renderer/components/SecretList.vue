<script setup>
import { computed } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../lib/icons.js';

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  selectedId: {
    type: String,
    default: null,
  },
  total: {
    type: Number,
    default: 0,
  },
  query: {
    type: String,
    default: '',
  },
  filter: {
    type: String,
    default: 'all',
  },
});

const emit = defineEmits([
  'select',
  'edit',
  'delete',
  'favorite',
  'copy',
  'create',
  'clear-filters',
]);

const isSearching = computed(() => props.query.trim().length > 0);

const groups = computed(() => {
  if (isSearching.value || props.filter === 'favorites') {
    return [{ key: 'results', label: null, items: props.items }];
  }
  const favorites = props.items.filter((item) => item.favorite);
  const rest = props.items.filter((item) => !item.favorite);
  const result = [];
  if (favorites.length > 0) {
    result.push({ key: 'favorites', label: 'Favoritas', items: favorites });
  }
  if (rest.length > 0) {
    result.push({ key: 'all', label: 'Credenciales', items: rest });
  }
  return result;
});

const showGroupLabels = computed(() => groups.value.length > 1);

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category;
}

function categoryIcon(category) {
  return CATEGORY_ICONS[category] ?? 'globe';
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'ahora mismo';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 7 * 86_400_000) return `hace ${Math.floor(diff / 86_400_000)} d`;
  return new Date(iso).toLocaleDateString('es-ES', {
    month: 'short',
    day: 'numeric',
  });
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      v-if="total === 0"
      class="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center"
    >
      <span
        class="grid size-11 place-items-center rounded-xl border border-line bg-raised text-faint"
      >
        <AppIcon name="key" :size="19" />
      </span>
      <p class="mt-4 text-[13px] font-medium text-ink">Tu bóveda está vacía</p>
      <p class="mt-1 max-w-[240px] text-[12px] leading-relaxed text-muted">
        Añade tu primera credencial y se cifrará en local antes de tocar el
        disco.
      </p>
      <button
        type="button"
        class="btn btn-secondary btn-sm mt-4"
        @click="emit('create')"
      >
        <AppIcon name="plus" :size="13" />
        Añadir credencial
      </button>
    </div>

    <div
      v-else-if="items.length === 0"
      class="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center"
    >
      <span
        class="grid size-11 place-items-center rounded-xl border border-line bg-raised text-faint"
      >
        <AppIcon name="search" :size="19" />
      </span>
      <p class="mt-4 text-[13px] font-medium text-ink">
        Ninguna credencial coincide
      </p>
      <p class="mt-1 max-w-[240px] text-[12px] leading-relaxed text-muted">
        Prueba con otra búsqueda o quita los filtros activos.
      </p>
      <button
        type="button"
        class="btn btn-ghost btn-sm mt-3"
        @click="emit('clear-filters')"
      >
        Limpiar búsqueda y filtros
      </button>
    </div>

    <div v-else class="scroll-area min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <section v-for="group in groups" :key="group.key">
        <h2
          v-if="group.label && showGroupLabels"
          class="section-label sticky top-0 z-10 bg-surface px-2 py-2"
        >
          {{ group.label }}
        </h2>
        <ul class="space-y-0.5">
          <li v-for="item in group.items" :key="item.id" class="group relative">
            <div
              class="flex items-center gap-1 rounded-[10px] pr-1 transition-colors duration-150"
              :class="
                selectedId === item.id
                  ? 'bg-accent-soft'
                  : 'hover:bg-raised focus-within:bg-raised'
              "
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2 text-left"
                :aria-current="selectedId === item.id ? 'true' : undefined"
                @click="emit('select', item)"
              >
                <span
                  class="grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150"
                  :class="
                    selectedId === item.id
                      ? 'border-accent/25 bg-surface text-accent'
                      : 'border-line bg-raised text-muted'
                  "
                >
                  <AppIcon :name="categoryIcon(item.category)" :size="15" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span
                      class="truncate text-[12.5px] font-medium text-ink"
                      :class="selectedId === item.id ? 'text-accent' : ''"
                    >
                      {{ item.title }}
                    </span>
                    <AppIcon
                      v-if="item.favorite"
                      name="star"
                      :size="10"
                      class="shrink-0 text-warn"
                    />
                  </span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-[11px]">
                    <span class="truncate text-faint">
                      {{ item.username || 'Sin usuario' }}
                    </span>
                    <span class="text-line-strong">·</span>
                    <span class="shrink-0 text-faint">
                      {{ categoryLabel(item.category) }}
                    </span>
                  </span>
                </span>
                <span
                  class="hidden shrink-0 pr-1 text-[10.5px] whitespace-nowrap text-faint sm:block"
                >
                  {{ formatRelative(item.updatedAt) }}
                </span>
              </button>

              <div
                class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
              >
                <button
                  type="button"
                  class="row-action"
                  :aria-label="
                    item.favorite
                      ? `Quitar ${item.title} de favoritas`
                      : `Añadir ${item.title} a favoritas`
                  "
                  :aria-pressed="Boolean(item.favorite)"
                  @click.stop="emit('favorite', item)"
                >
                  <AppIcon
                    name="star"
                    :size="13"
                    :class="item.favorite ? 'text-warn' : ''"
                  />
                </button>
                <button
                  type="button"
                  class="row-action"
                  :aria-label="`Copiar secreto de ${item.title}`"
                  @click.stop="emit('copy', item)"
                >
                  <AppIcon name="copy" :size="13" />
                </button>
                <button
                  type="button"
                  class="row-action"
                  :aria-label="`Editar ${item.title}`"
                  @click.stop="emit('edit', item)"
                >
                  <AppIcon name="pencil" :size="13" />
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
