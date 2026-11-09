<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import StrengthMeter from './ui/StrengthMeter.vue';
import { CATEGORY_LABELS } from '../lib/icons.js';
import { estimateStrength } from '../lib/security-audit.js';
import { generatePassword } from '../lib/password-generator.js';

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
  favorite: false,
});

const revealed = ref(false);
const error = ref('');
const titleInput = ref(null);
const dialog = ref(null);
/** Element that opened the dialog; focus returns to it on close (S6). */
const returnFocus = ref(null);

const strength = computed(() => estimateStrength(form.secret));
const isEditing = computed(() => Boolean(props.item));

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
    form.title = props.item?.title ?? '';
    form.username = props.item?.username ?? '';
    form.secret = props.item?.secret ?? '';
    form.category = props.item?.category ?? 'password';
    form.notes = props.item?.notes ?? '';
    form.favorite = Boolean(props.item?.favorite);
    revealed.value = false;
    error.value = '';
    await nextTick();
    titleInput.value?.focus();
  },
);

function generate() {
  form.secret = generatePassword({ length: 20 });
  revealed.value = true;
  error.value = '';
}

function submit() {
  if (!form.title.trim()) {
    error.value = 'El título es obligatorio.';
    titleInput.value?.focus();
    return;
  }
  emit('save', {
    title: form.title.trim(),
    username: form.username.trim(),
    secret: form.secret,
    category: form.category,
    notes: form.notes,
    favorite: form.favorite,
  });
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const nodes = dialog.value?.querySelectorAll(
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
</script>

<template>
  <div
    v-if="open"
    class="animate-fade-in fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:grid sm:items-center sm:p-4"
    @click.self="emit('cancel')"
  >
    <form
      ref="dialog"
      class="animate-rise flex max-h-[92vh] w-full flex-col rounded-t-panel border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credential-dialog-title"
      @submit.prevent="submit"
      @keydown="trapFocus"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"
      >
        <div>
          <h2
            id="credential-dialog-title"
            class="text-[14px] font-semibold tracking-tight text-ink"
          >
            {{ isEditing ? 'Editar credencial' : 'Nueva credencial' }}
          </h2>
          <p class="mt-0.5 text-[11.5px] text-faint">
            {{
              isEditing
                ? 'Los cambios se vuelven a cifrar al guardar.'
                : 'Se cifra antes de escribirse en disco.'
            }}
          </p>
        </div>
        <button
          type="button"
          class="row-action"
          aria-label="Cerrar diálogo"
          @click="emit('cancel')"
        >
          <AppIcon name="x" :size="15" />
        </button>
      </div>

      <div class="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div class="space-y-3.5">
          <div>
            <label for="credential-title" class="label">Título</label>
            <input
              id="credential-title"
              ref="titleInput"
              v-model="form.title"
              class="field mt-1.5"
              placeholder="GitHub, AWS, correo personal…"
              autocomplete="off"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'credential-error' : undefined"
            />
            <p
              v-if="error"
              id="credential-error"
              role="alert"
              class="mt-1.5 text-[11.5px] font-medium text-danger"
            >
              {{ error }}
            </p>
          </div>

          <div class="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label for="credential-username" class="label">Usuario</label>
              <input
                id="credential-username"
                v-model="form.username"
                class="field mt-1.5"
                placeholder="usuario@ejemplo.com"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div>
              <label for="credential-category" class="label">Categoría</label>
              <select
                id="credential-category"
                v-model="form.category"
                class="field mt-1.5"
              >
                <option v-for="c in categories" :key="c" :value="c">
                  {{ CATEGORY_LABELS[c] ?? c }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between gap-2">
              <label for="credential-secret" class="label">Secreto</label>
              <button
                type="button"
                class="btn btn-ghost btn-sm px-2 text-[11px]"
                @click="generate"
              >
                <AppIcon name="wand" :size="12" />
                Generar
              </button>
            </div>
            <div class="relative mt-1.5">
              <input
                id="credential-secret"
                v-model="form.secret"
                :type="revealed ? 'text' : 'password'"
                class="field pr-12 font-mono text-[12.5px] sm:pr-10"
                placeholder="Contraseña, token o valor secreto"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="row-action absolute top-1/2 right-1.5 size-11 -translate-y-1/2 sm:size-8"
                :aria-label="revealed ? 'Ocultar secreto' : 'Mostrar secreto'"
                :aria-pressed="revealed"
                @click="revealed = !revealed"
              >
                <AppIcon :name="revealed ? 'eyeOff' : 'eye'" :size="14" />
              </button>
            </div>
            <div v-if="form.secret" class="mt-2">
              <StrengthMeter :score="strength.score" />
            </div>
          </div>

          <div>
            <label for="credential-notes" class="label">Notas</label>
            <textarea
              id="credential-notes"
              v-model="form.notes"
              rows="3"
              class="field mt-1.5"
              placeholder="Códigos de recuperación, contexto, datos de la cuenta…"
            ></textarea>
          </div>

          <label
            class="flex w-fit items-center gap-2 text-[12.5px] font-medium text-muted"
          >
            <input
              v-model="form.favorite"
              type="checkbox"
              class="size-4 rounded border-line accent-accent"
            />
            Fijar en favoritas
          </label>
        </div>
      </div>

      <div
        class="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3"
      >
        <button type="button" class="btn btn-secondary" @click="emit('cancel')">
          Cancelar
        </button>
        <button type="submit" class="btn btn-primary">
          {{ isEditing ? 'Guardar cambios' : 'Crear credencial' }}
        </button>
      </div>
    </form>
  </div>
</template>
