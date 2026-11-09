<script setup>
import { computed, ref, watch } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import StrengthMeter from './ui/StrengthMeter.vue';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../lib/icons.js';
import { estimateStrength } from '../lib/security-audit.js';
import { copyText } from '../lib/clipboard.js';
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['back', 'edit', 'delete', 'favorite']);
const { toast } = useToast();

const revealed = ref(false);
const copied = ref('');

const categoryLabel = computed(
  () => CATEGORY_LABELS[props.item.category] ?? props.item.category,
);
const categoryIcon = computed(
  () => CATEGORY_ICONS[props.item.category] ?? 'globe',
);
const strength = computed(() => estimateStrength(props.item.secret ?? ''));
const hasSecret = computed(() => Boolean(props.item.secret));

const maskedSecret = computed(() => {
  const length = Math.min(28, Math.max(10, props.item.secret?.length ?? 10));
  return '•'.repeat(length);
});

watch(
  () => props.item.id,
  () => {
    revealed.value = false;
    copied.value = '';
  },
);

function formatDate(iso) {
  const value = Date.parse(iso ?? '');
  if (!Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copy(field, value, label) {
  if (!value) return;
  const ok = await copyText(value, { sensitive: field === 'secret' });
  if (ok) {
    copied.value = field;
    toast(
      field === 'secret'
        ? 'Secreto copiado · se borra en 30 s'
        : `${label} copiado`,
      { tone: 'secure' },
    );
    setTimeout(() => {
      if (copied.value === field) copied.value = '';
    }, 1600);
  } else {
    toast('Portapapeles no disponible', { tone: 'error' });
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-2 sm:px-4"
    >
      <button
        type="button"
        class="btn btn-ghost btn-sm lg:hidden"
        aria-label="Volver a las credenciales"
        @click="emit('back')"
      >
        <AppIcon name="arrowLeft" :size="14" />
        Atrás
      </button>
      <span class="section-label hidden lg:block">Credencial</span>

      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="btn btn-ghost btn-sm min-w-11 sm:h-8 sm:px-2.5"
          :aria-pressed="Boolean(item.favorite)"
          :aria-label="
            item.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'
          "
          @click="emit('favorite', item)"
        >
          <AppIcon
            name="star"
            :size="14"
            :class="item.favorite ? 'text-warn' : ''"
          />
          <span class="hidden sm:inline">Favorito</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm min-w-11 sm:h-8 sm:px-2.5"
          @click="emit('edit', item)"
        >
          <AppIcon name="pencil" :size="13" />
          <span class="hidden sm:inline">Editar</span>
          <span class="sr-only sm:hidden">Editar credencial</span>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm size-11 text-faint hover:bg-danger-soft hover:text-danger sm:size-8"
          aria-label="Eliminar credencial"
          @click="emit('delete', item)"
        >
          <AppIcon name="trash" :size="14" />
        </button>
      </div>
    </div>

    <div class="scroll-area min-h-0 flex-1 overflow-y-auto">
      <div class="w-full max-w-2xl px-4 py-6 sm:px-6">
        <!-- Identity -->
        <div class="flex items-start gap-3.5">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-[8px] border border-line bg-raised text-muted"
          >
            <AppIcon :name="categoryIcon" :size="18" />
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="pb-title truncate">{{ item.title }}</h1>
            <div
              class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-faint"
            >
              <span class="section-label">{{ categoryLabel }}</span>
              <span aria-hidden="true">·</span>
              <time class="mono" :datetime="item.updatedAt">
                {{ formatDate(item.updatedAt) }}
              </time>
            </div>
          </div>
        </div>

        <!-- Fields: an open, hairline-separated list (S14) -->
        <dl class="mt-6 border-t border-line">
          <div class="flex items-center gap-3 border-b border-line py-3.5 pr-1">
            <dt class="label w-[74px] shrink-0">Usuario</dt>
            <dd class="mono min-w-0 flex-1 truncate text-ink">
              {{ item.username || '—' }}
            </dd>
            <button
              type="button"
              class="row-action shrink-0"
              :disabled="!item.username"
              :aria-label="`Copiar usuario de ${item.title}`"
              @click="copy('username', item.username, 'Usuario')"
            >
              <AppIcon
                :name="copied === 'username' ? 'check' : 'copy'"
                :size="14"
                :class="copied === 'username' ? 'text-ok' : ''"
              />
            </button>
          </div>

          <!-- The secret row is the visual anchor of the dossier -->
          <div
            class="-mx-3 border-b border-line bg-raised px-3 py-3.5 sm:-mx-4 sm:px-4"
          >
            <div class="flex items-start gap-3">
              <dt class="label w-[74px] shrink-0 pt-1">Secreto</dt>
              <dd class="min-w-0 flex-1">
                <p
                  v-if="hasSecret"
                  class="mono text-[13.5px] break-all text-ink"
                  :class="revealed ? '' : 'tracking-[0.16em] text-muted'"
                >
                  {{ revealed ? item.secret : maskedSecret }}
                </p>
                <p v-else class="text-[12.5px] text-faint">
                  Sin secreto guardado
                </p>
                <div v-if="hasSecret" class="mt-2.5 max-w-[280px]">
                  <StrengthMeter :score="strength.score" />
                  <p class="hint mt-1.5">
                    Estimación según longitud y variedad de caracteres; no es
                    una garantía.
                  </p>
                </div>
              </dd>
              <div class="flex shrink-0 items-center gap-0.5 pt-0.5">
                <button
                  type="button"
                  class="row-action"
                  :disabled="!hasSecret"
                  :aria-label="revealed ? 'Ocultar secreto' : 'Mostrar secreto'"
                  :aria-pressed="revealed"
                  @click="revealed = !revealed"
                >
                  <AppIcon :name="revealed ? 'eyeOff' : 'eye'" :size="14" />
                </button>
                <button
                  type="button"
                  class="row-action"
                  :disabled="!hasSecret"
                  :aria-label="`Copiar secreto de ${item.title}`"
                  @click="copy('secret', item.secret, 'Secreto')"
                >
                  <AppIcon
                    :name="copied === 'secret' ? 'check' : 'copy'"
                    :size="14"
                    :class="copied === 'secret' ? 'text-ok' : ''"
                  />
                </button>
              </div>
            </div>
          </div>

          <div class="flex gap-3 border-b border-line py-3.5">
            <dt class="label w-[74px] shrink-0 pt-0.5">Notas</dt>
            <dd
              class="min-w-0 flex-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted"
            >
              {{ item.notes || 'Sin notas.' }}
            </dd>
          </div>
        </dl>

        <!-- Metadata footer: tabular readout -->
        <dl class="mt-3.5 grid grid-cols-2 gap-x-4 text-[11px] tabular-nums">
          <div class="flex gap-1.5">
            <dt class="text-faint">Creada</dt>
            <dd class="text-muted">{{ formatDate(item.createdAt) }}</dd>
          </div>
          <div class="flex justify-end gap-1.5">
            <dt class="text-faint">Actualizada</dt>
            <dd class="text-muted">{{ formatDate(item.updatedAt) }}</dd>
          </div>
        </dl>

        <p class="mt-5 flex items-center gap-1.5 text-[11px] text-faint">
          <AppIcon name="lock" :size="11" class="shrink-0" />
          Cifrado en este dispositivo. Copiar un secreto lo coloca en el
          portapapeles.
        </p>
      </div>
    </div>
  </div>
</template>
