<script setup>
import { computed } from 'vue';
import { ICONS } from '../../lib/icons.js';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 16,
  },
  strokeWidth: {
    type: [Number, String],
    default: 1.7,
  },
  label: {
    type: String,
    default: '',
  },
});

const shapes = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="label ? undefined : 'true'"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    focusable="false"
  >
    <template v-for="(shape, index) in shapes" :key="index">
      <path v-if="shape[0] === 'path'" :d="shape[1]" />
      <circle
        v-else-if="shape[0] === 'circle'"
        :cx="shape[1]"
        :cy="shape[2]"
        :r="shape[3]"
      />
      <rect
        v-else-if="shape[0] === 'rect'"
        :x="shape[1]"
        :y="shape[2]"
        :width="shape[3]"
        :height="shape[4]"
        :rx="shape[5]"
      />
      <ellipse
        v-else-if="shape[0] === 'ellipse'"
        :cx="shape[1]"
        :cy="shape[2]"
        :rx="shape[3]"
        :ry="shape[4]"
      />
    </template>
  </svg>
</template>
