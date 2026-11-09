<script setup>
import { nextTick, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '¿Seguro?',
  },
  description: {
    type: String,
    default: '',
  },
  confirmLabel: {
    type: String,
    default: 'Confirmar',
  },
  cancelLabel: {
    type: String,
    default: 'Cancelar',
  },
});

const emit = defineEmits(['confirm', 'cancel']);
const cancelButton = ref(null);
const dialogEl = ref(null);
/** Element that opened the dialog; focus returns to it on close (S6). */
const returnFocus = ref(null);

function close() {
  emit('cancel');
}

function confirm() {
  emit('confirm');
}

function onKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = dialogEl.value?.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
  );
  if (!nodes || nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      const target = returnFocus.value;
      returnFocus.value = null;
      await nextTick();
      if (target?.isConnected) target.focus();
      return;
    }
    returnFocus.value =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await nextTick();
    cancelButton.value?.focus();
  },
);
</script>

<template>
  <div
    v-if="open"
    class="animate-fade-in fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    @keydown="onKeydown"
    @click.self="close"
  >
    <div
      ref="dialogEl"
      class="animate-rise w-full max-w-sm rounded-panel border border-line bg-surface p-5 shadow-pop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      :aria-describedby="description ? 'confirm-description' : undefined"
    >
      <div class="flex items-start gap-3">
        <span
          class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"
        >
          <AppIcon name="alert" :size="15" />
        </span>
        <div class="min-w-0">
          <h2 id="confirm-title" class="text-[14px] font-semibold text-ink">
            {{ title }}
          </h2>
          <p
            v-if="description"
            id="confirm-description"
            class="mt-1 text-[12.5px] leading-relaxed text-muted"
          >
            {{ description }}
          </p>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          ref="cancelButton"
          type="button"
          class="btn btn-secondary"
          @click="close"
        >
          {{ cancelLabel }}
        </button>
        <button type="button" class="btn btn-danger" @click="confirm">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
