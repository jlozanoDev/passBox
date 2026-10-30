<script setup>
defineProps({
  items: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['edit', 'delete']);

const categoryLabels = {
  password: 'Password',
  api_token: 'API Token',
  database: 'Database',
  note: 'Note',
  other: 'Other',
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
</script>

<template>
  <ul class="divide-y divide-neutral-200">
    <li
      v-for="item in items"
      :key="item.id"
      class="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-100"
    >
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-neutral-900">
          {{ item.title }}
        </p>
        <p class="truncate text-xs text-neutral-500">{{ item.username }}</p>
      </div>

      <span
        class="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700"
      >
        {{ categoryLabels[item.category] ?? item.category }}
      </span>

      <span class="hidden text-xs text-neutral-400 sm:block">
        {{ formatDate(item.updatedAt) }}
      </span>

      <div
        class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
          @click="$emit('edit', item)"
        >
          Edit
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600"
          @click="$emit('delete', item)"
        >
          Delete
        </button>
      </div>
    </li>

    <li v-if="items.length === 0" class="px-4 py-10 text-center">
      <p class="text-sm text-neutral-500">No secrets yet.</p>
      <p class="mt-1 text-xs text-neutral-400">
        Create your first one with the button above.
      </p>
    </li>
  </ul>
</template>
