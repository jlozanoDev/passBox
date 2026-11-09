<script setup>
import AppIcon from './ui/AppIcon.vue';
import BrandMark from './ui/BrandMark.vue';
import { useTheme } from '../composables/useTheme.js';

defineProps({
  views: {
    type: Array,
    required: true,
  },
  active: {
    type: String,
    required: true,
  },
  itemCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['select', 'lock']);

const { preference, setPreference } = useTheme();

const themeOptions = [
  { value: 'light', icon: 'sun', label: 'Tema claro' },
  { value: 'dark', icon: 'moon', label: 'Tema oscuro' },
  { value: 'system', icon: 'monitor', label: 'Tema del sistema' },
];

const workspaceViews = ['vault', 'generator', 'security'];
</script>

<template>
  <!--
    Index rail below 1024px (icons only, accessible names kept), full
    typographic index from 1024px up, hidden below 640px where the bottom
    navigation takes over (S1, S14).
  -->
  <aside
    class="hidden w-16 shrink-0 flex-col border-r border-line bg-surface sm:flex lg:w-[236px]"
  >
    <div
      class="flex h-16 shrink-0 items-center justify-center border-b border-line lg:justify-start lg:gap-2.5 lg:px-4"
    >
      <span
        class="grid size-8 shrink-0 place-items-center rounded-[7px] bg-ink text-canvas"
      >
        <BrandMark :size="17" />
      </span>
      <div class="hidden min-w-0 lg:block">
        <p class="text-[13px] font-semibold tracking-[-0.01em] text-ink">
          Passbox
        </p>
        <p class="text-[10px] text-faint">Bóveda de conocimiento cero</p>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto p-2.5" aria-label="Navegación principal">
      <p class="section-label hidden px-2 pt-1 pb-1.5 lg:block">
        Espacio de trabajo
      </p>
      <div class="space-y-0.5">
        <button
          v-for="view in views.filter((entry) =>
            workspaceViews.includes(entry.id),
          )"
          :key="view.id"
          type="button"
          class="nav-item justify-center px-0 lg:justify-start lg:px-2.5"
          :class="active === view.id ? 'nav-item-active' : ''"
          :aria-current="active === view.id ? 'page' : undefined"
          :aria-label="view.label"
          :title="view.label"
          @click="emit('select', view.id)"
        >
          <span
            v-if="active === view.id"
            class="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent"
            aria-hidden="true"
          />
          <AppIcon :name="view.icon" :size="16" />
          <span class="hidden flex-1 text-left lg:inline">
            {{ view.label }}
          </span>
          <span
            v-if="view.id === 'vault' && itemCount > 0"
            class="hidden rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted lg:inline-block"
          >
            {{ itemCount }}
          </span>
        </button>
      </div>

      <p class="section-label hidden px-2 pt-5 pb-1.5 lg:block">Preferencias</p>
      <button
        v-for="view in views.filter(
          (entry) => !workspaceViews.includes(entry.id),
        )"
        :key="view.id"
        type="button"
        class="nav-item justify-center px-0 lg:justify-start lg:px-2.5"
        :class="active === view.id ? 'nav-item-active' : ''"
        :aria-current="active === view.id ? 'page' : undefined"
        :aria-label="view.label"
        :title="view.label"
        @click="emit('select', view.id)"
      >
        <span
          v-if="active === view.id"
          class="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent"
          aria-hidden="true"
        />
        <AppIcon :name="view.icon" :size="16" />
        <span class="hidden flex-1 text-left lg:inline">
          {{ view.label }}
        </span>
      </button>
    </nav>

    <div class="shrink-0 space-y-2 border-t border-line p-2.5">
      <div
        class="hidden w-full rounded-field border border-line bg-raised p-0.5 lg:inline-flex"
        role="radiogroup"
        aria-label="Tema"
      >
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="preference === option.value"
          :aria-label="option.label"
          class="grid h-11 flex-1 place-items-center rounded-[5px] transition-colors duration-150 lg:h-7"
          :class="
            preference === option.value
              ? 'bg-surface text-ink shadow-card'
              : 'text-faint hover:text-muted'
          "
          @click="setPreference(option.value)"
        >
          <AppIcon :name="option.icon" :size="13" />
        </button>
      </div>

      <button
        type="button"
        class="btn btn-secondary w-full justify-center px-0 lg:justify-start lg:px-3"
        aria-label="Bloquear bóveda"
        title="Bloquear bóveda"
        @click="emit('lock')"
      >
        <AppIcon name="lock" :size="13" />
        <span class="hidden lg:inline">Bloquear bóveda</span>
      </button>

      <p
        class="hidden items-center justify-center gap-1 px-1 text-[10px] text-faint lg:flex"
      >
        <AppIcon name="shield" :size="10" />
        Cifrado en este dispositivo
      </p>
    </div>
  </aside>
</template>
