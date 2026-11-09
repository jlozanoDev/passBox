<script setup>
import { computed, ref } from 'vue';
import AppIcon from './ui/AppIcon.vue';

defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'Buscar credenciales…',
  },
});

const emit = defineEmits(['update:modelValue']);
const input = ref(null);

const shortcut = computed(() => {
  const platform =
    typeof navigator === 'undefined' ? '' : navigator.platform || '';
  return /mac/i.test(platform) ? '⌘K' : 'Ctrl K';
});

function onInput(event) {
  emit('update:modelValue', event.target.value);
}

function clear() {
  emit('update:modelValue', '');
  input.value?.focus();
}

defineExpose({
  focus: () => input.value?.focus(),
});
</script>

<template>
  <div class="relative">
    <AppIcon
      name="search"
      :size="15"
      class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
    />
    <input
      ref="input"
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      aria-label="Buscar credenciales"
      autocomplete="off"
      spellcheck="false"
      class="field pr-16 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      @input="onInput"
    />
    <button
      v-if="modelValue"
      type="button"
      class="row-action absolute top-1/2 right-2 -translate-y-1/2"
      aria-label="Limpiar búsqueda"
      @click="clear"
    >
      <AppIcon name="x" :size="13" />
    </button>
    <kbd
      v-else
      class="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 sm:inline-flex kbd"
    >
      {{ shortcut }}
    </kbd>
  </div>
</template>
