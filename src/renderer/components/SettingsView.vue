<script setup>
import { computed } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import CloudSettings from './CloudSettings.vue';
import { useTheme } from '../composables/useTheme.js';

const props = defineProps({
  itemCount: {
    type: Number,
    default: 0,
  },
  favoriteCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['lock']);

const { preference, setPreference } = useTheme();

const themes = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
];

const shortcutModifier = /mac/i.test(
  typeof navigator === 'undefined' ? '' : navigator.platform || '',
)
  ? '⌘'
  : 'Ctrl';

const shortcuts = computed(() => [
  { keys: [shortcutModifier, 'K'], action: 'Enfocar búsqueda' },
  { keys: ['Esc'], action: 'Cerrar diálogo o panel de detalles' },
]);
</script>

<template>
  <div class="scroll-area h-full overflow-y-auto">
    <div class="w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <!-- Open sections separated by hairlines (S14) -->
      <section>
        <div
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <h2 class="section-label">Apariencia</h2>
          <p class="text-[11.5px] text-faint">
            El tema Sistema sigue la configuración de tu sistema operativo.
          </p>
        </div>
        <div
          class="mt-3 inline-flex rounded-field border border-line bg-raised p-1"
          role="radiogroup"
          aria-label="Tema"
        >
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            role="radio"
            :aria-checked="preference === theme.value"
            class="inline-flex h-11 items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-medium transition-colors duration-150 sm:h-8"
            :class="
              preference === theme.value
                ? 'bg-surface text-ink shadow-card'
                : 'text-muted hover:text-ink'
            "
            @click="setPreference(theme.value)"
          >
            <AppIcon :name="theme.icon" :size="13" />
            {{ theme.label }}
          </button>
        </div>
      </section>

      <section class="mt-6 border-t border-line pt-6">
        <div
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <h2 class="section-label">Bóveda</h2>
          <p class="text-[11.5px] text-faint">
            Archivo local cifrado. La sincronización es opcional.
          </p>
        </div>

        <dl class="mt-3 divide-y divide-line border-t border-line">
          <div class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-[12.5px] text-muted">Credenciales</dt>
            <dd class="font-mono text-[12.5px] text-ink tabular-nums">
              {{ itemCount }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-[12.5px] text-muted">Favoritas</dt>
            <dd class="font-mono text-[12.5px] text-ink tabular-nums">
              {{ favoriteCount }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-[12.5px] text-muted">Contraseña maestra</dt>
            <dd class="text-[12px] text-ink">Nunca se almacena</dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-[12.5px] text-muted">En reposo</dt>
            <dd class="text-[12px] text-ink">Sobre cifrado</dd>
          </div>
        </dl>

        <button
          type="button"
          class="btn btn-secondary mt-4"
          @click="emit('lock')"
        >
          <AppIcon name="lock" :size="13" />
          Bloquear bóveda
        </button>
      </section>

      <section class="mt-6 border-t border-line pt-6">
        <CloudSettings />
      </section>

      <section class="mt-6 border-t border-line pt-6">
        <h2 class="section-label">Teclado</h2>
        <ul class="mt-3 divide-y divide-line border-t border-line">
          <li
            v-for="shortcut in shortcuts"
            :key="shortcut.action"
            class="flex items-center justify-between gap-4 py-2.5"
          >
            <span class="text-[12.5px] text-muted">{{ shortcut.action }}</span>
            <span class="flex items-center gap-1">
              <kbd v-for="key in shortcut.keys" :key="key" class="kbd">{{
                key
              }}</kbd>
            </span>
          </li>
        </ul>
      </section>

      <p class="mt-6 border-t border-line pt-4 text-[11px] text-faint">
        Passbox 1.0 — gestor de secretos local y de conocimiento cero.
      </p>
    </div>
  </div>
</template>
