<script setup>
import AppIcon from './AppIcon.vue';
import { useToast } from '../../composables/useToast.js';

const { toasts, dismiss } = useToast();

const toneStyles = {
  default: 'text-ink',
  success: 'text-ok',
  error: 'text-danger',
  secure: 'text-accent',
};

const toneIcons = {
  default: 'check',
  success: 'check',
  error: 'alert',
  secure: 'lock',
};
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4 max-sm:bottom-24"
    aria-live="polite"
    role="status"
  >
    <div
      v-for="entry in toasts"
      :key="entry.id"
      class="animate-toast-in pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3 pl-2.5 shadow-pop"
    >
      <AppIcon
        :name="toneIcons[entry.tone] ?? 'check'"
        :size="14"
        :class="toneStyles[entry.tone] ?? toneStyles.default"
      />
      <span class="truncate text-[12.5px] font-medium text-ink">
        {{ entry.message }}
      </span>
      <button
        type="button"
        class="row-action -my-2.5 rounded-full sm:my-0"
        aria-label="Cerrar notificación"
        @click="dismiss(entry.id)"
      >
        <AppIcon name="x" :size="11" />
      </button>
    </div>
  </div>
</template>
