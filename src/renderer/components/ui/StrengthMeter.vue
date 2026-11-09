<script setup>
import { computed } from 'vue';
import { STRENGTH_LABELS } from '../../lib/security-audit.js';

const props = defineProps({
  score: {
    type: Number,
    default: 0,
  },
  showLabel: {
    type: Boolean,
    default: true,
  },
});

const filled = computed(() =>
  Math.min(4, Math.max(1, Math.round(props.score) + 1)),
);

const tone = computed(() => {
  if (props.score <= 1) return 'bg-danger';
  if (props.score === 2) return 'bg-warn';
  return 'bg-ok';
});
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex flex-1 gap-1" aria-hidden="true">
      <span
        v-for="index in 4"
        :key="index"
        class="h-1 flex-1 rounded-full transition-colors duration-200"
        :class="index <= filled ? tone : 'bg-sunken'"
      />
    </div>
    <span
      v-if="showLabel"
      class="min-w-[68px] text-right text-[11px] font-medium text-muted"
    >
      {{ STRENGTH_LABELS[Math.min(4, Math.max(0, Math.round(score)))] }}
    </span>
  </div>
</template>
