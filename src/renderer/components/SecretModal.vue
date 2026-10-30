<script setup>
import { reactive, watch } from 'vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['save', 'cancel']);

const categories = ['password', 'api_token', 'database', 'note', 'other'];

const form = reactive({
  title: '',
  username: '',
  secret: '',
  category: 'password',
  notes: '',
});

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    form.title = props.item?.title ?? '';
    form.username = props.item?.username ?? '';
    form.secret = props.item?.secret ?? '';
    form.category = props.item?.category ?? 'password';
    form.notes = props.item?.notes ?? '';
  },
);

function submit() {
  if (!form.title.trim()) return;
  emit('save', {
    title: form.title.trim(),
    username: form.username.trim(),
    secret: form.secret,
    category: form.category,
    notes: form.notes,
  });
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-10 flex items-center justify-center bg-neutral-900/40 p-4"
    @click.self="emit('cancel')"
  >
    <form
      class="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      @submit.prevent="submit"
    >
      <h2 class="text-lg font-semibold text-neutral-900">
        {{ item ? 'Edit secret' : 'New secret' }}
      </h2>

      <div class="mt-4 space-y-3">
        <label class="block">
          <span class="text-xs font-medium text-neutral-600">Title</span>
          <input
            v-model="form.title"
            required
            class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>

        <label class="block">
          <span class="text-xs font-medium text-neutral-600">Username</span>
          <input
            v-model="form.username"
            class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>

        <label class="block">
          <span class="text-xs font-medium text-neutral-600">Secret</span>
          <input
            v-model="form.secret"
            type="password"
            class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </label>

        <label class="block">
          <span class="text-xs font-medium text-neutral-600">Category</span>
          <select
            v-model="form.category"
            class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option v-for="c in categories" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="text-xs font-medium text-neutral-600">Notes</span>
          <textarea
            v-model="form.notes"
            rows="3"
            class="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          ></textarea>
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Save
        </button>
      </div>
    </form>
  </div>
</template>
