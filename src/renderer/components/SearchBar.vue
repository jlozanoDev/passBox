<script setup>
defineProps({
  modelValue: {
    type: String,
    default: '',
  },
});

defineEmits(['update:modelValue']);
</script>

<template>
  <input
    type="search"
    :value="modelValue"
    placeholder="Search secrets..."
    class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 shadow-xs outline-none focus:border-neutral-400"
    @input="$emit('update:modelValue', $event.target.value)"
  />
</template>
