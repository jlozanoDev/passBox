<script setup>
/**
 * Passbox brand mark: two interlocking brackets around a void — the secret
 * held between two halves. Original glyph, no key/lock cliché.
 */
defineProps({
  size: {
    type: Number,
    default: 18,
  },
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M13 4H4v24h9v-6h-3V10h3V4Z" fill="currentColor" />
    <path d="M19 4h9v24h-9v-6h3V10h-3V4Z" fill="currentColor" />
    <rect x="14" y="14" width="4" height="4" fill="var(--pb-accent)" />
  </svg>
</template>
