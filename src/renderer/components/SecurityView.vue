<script setup>
import { computed } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import StrengthMeter from './ui/StrengthMeter.vue';
import { STALE_AFTER_DAYS, auditVault } from '../lib/security-audit.js';

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['open', 'go-vault']);

const byId = computed(() => {
  const map = new Map();
  for (const item of props.items) map.set(item.id, item);
  return map;
});

const audit = computed(() => auditVault(props.items));

const weakItems = computed(() =>
  audit.value.weak.map((id) => byId.value.get(id)).filter(Boolean),
);
const staleItems = computed(() =>
  audit.value.stale.map((id) => byId.value.get(id)).filter(Boolean),
);
const reusedGroups = computed(() =>
  audit.value.reused.map((group) => ({
    ...group,
    items: group.ids.map((id) => byId.value.get(id)).filter(Boolean),
  })),
);

const needsAttention = computed(
  () =>
    weakItems.value.length > 0 ||
    reusedGroups.value.length > 0 ||
    staleItems.value.length > 0,
);

const stats = computed(() => [
  {
    key: 'total',
    label: 'Credenciales',
    value: audit.value.total,
    icon: 'key',
    hint: 'Guardadas en esta bóveda',
  },
  {
    key: 'favorites',
    label: 'Favoritas',
    value: audit.value.favorites,
    icon: 'star',
    hint: 'Fijadas para acceso rápido',
  },
  {
    key: 'reused',
    label: 'Secretos reutilizados',
    value: reusedGroups.value.length,
    icon: 'copy',
    hint: 'Mismo secreto en 2+ entradas',
    tone: reusedGroups.value.length > 0 ? 'warn' : 'ok',
  },
  {
    key: 'weak',
    label: 'Secretos débiles',
    value: weakItems.value.length,
    icon: 'alert',
    hint: 'Cortos, comunes o repetitivos',
    tone: weakItems.value.length > 0 ? 'danger' : 'ok',
  },
]);

function categoryLabel(value) {
  return value?.title ?? 'Sin título';
}
</script>

<template>
  <div class="scroll-area h-full overflow-y-auto">
    <div class="w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div v-if="audit.total === 0" class="py-16 text-center">
        <span
          class="mx-auto grid size-11 place-items-center rounded-[8px] border border-line bg-raised text-faint"
        >
          <AppIcon name="shield" :size="19" />
        </span>
        <p class="mt-4 text-[13px] font-medium text-ink">
          Aún no hay nada que auditar
        </p>
        <p class="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted">
          Añade credenciales a tu bóveda y Passbox destacará aquí los secretos
          débiles, reutilizados y antiguos, todo calculado en este dispositivo.
        </p>
        <button
          type="button"
          class="btn btn-secondary btn-sm mt-4"
          @click="emit('go-vault')"
        >
          <AppIcon name="arrowRight" :size="13" />
          Ir a la bóveda
        </button>
      </div>

      <div v-else>
        <!-- Instrument readout: hairline-separated, no boxes (S14) -->
        <dl class="grid grid-cols-2 border-y border-line sm:grid-cols-4">
          <div
            v-for="(stat, index) in stats"
            :key="stat.key"
            class="border-line px-4 py-4 sm:first:pl-0"
            :class="index < 2 ? 'border-b sm:border-b-0' : ''"
          >
            <dt
              class="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] text-faint uppercase"
            >
              {{ stat.label }}
              <AppIcon
                :name="stat.icon"
                :size="12"
                :class="
                  stat.tone === 'danger'
                    ? 'text-danger'
                    : stat.tone === 'warn'
                      ? 'text-warn'
                      : 'text-faint'
                "
              />
            </dt>
            <dd
              class="mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums"
            >
              {{ stat.value }}
            </dd>
            <dd class="mt-1.5 text-[11px] text-faint">{{ stat.hint }}</dd>
          </div>
        </dl>

        <section class="mt-6">
          <div
            class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <div>
              <h2 class="section-label">Salud de las contraseñas</h2>
              <p class="mt-1 text-[11.5px] text-faint">
                Fuerza media de {{ audit.assessed }} secretos guardados
              </p>
            </div>
            <span
              class="rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-medium text-muted tabular-nums"
            >
              {{ audit.stale.length }} con más de {{ STALE_AFTER_DAYS }} días
            </span>
          </div>
          <div class="mt-4">
            <StrengthMeter
              v-if="audit.assessed > 0"
              :score="audit.averageScore"
            />
            <p v-else class="text-[12px] text-muted">
              Todavía no hay secretos que evaluar; añade una credencial con
              secreto.
            </p>
          </div>
        </section>

        <section class="mt-6 border-t border-line pt-6">
          <h2 class="section-label">Requiere atención</h2>

          <div v-if="!needsAttention" class="px-1 py-8 text-center">
            <span
              class="mx-auto grid size-9 place-items-center rounded-full bg-ok-soft text-ok"
            >
              <AppIcon name="check" :size="16" />
            </span>
            <p class="mt-2.5 text-[12.5px] font-medium text-ink">
              No se han detectado secretos débiles, reutilizados ni antiguos
            </p>
            <p class="mt-1 text-[11.5px] text-faint">
              Sigue añadiendo contraseñas únicas y largas para mantenerte aquí.
            </p>
          </div>

          <div v-else class="mt-3 divide-y divide-line border-t border-line">
            <div v-if="weakItems.length" class="py-4">
              <div class="flex items-center gap-2">
                <AppIcon name="alert" :size="13" class="text-danger" />
                <h3 class="text-[12.5px] font-medium text-ink">
                  Secretos débiles
                  <span class="text-faint tabular-nums"
                    >({{ weakItems.length }})</span
                  >
                </h3>
              </div>
              <ul class="mt-2">
                <li v-for="item in weakItems" :key="item.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-field px-2 py-3.5 text-left transition-colors duration-150 hover:bg-raised sm:py-1.5"
                    @click="emit('open', item.id)"
                  >
                    <span class="size-1.5 shrink-0 rounded-full bg-danger" />
                    <span
                      class="min-w-0 flex-1 truncate text-[12.5px] text-ink"
                    >
                      {{ categoryLabel(item) }}
                    </span>
                    <span class="truncate text-[11px] text-faint">
                      {{ item.username || 'Sin usuario' }}
                    </span>
                    <AppIcon
                      name="chevronRight"
                      :size="12"
                      class="text-faint"
                    />
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="reusedGroups.length" class="py-4">
              <div class="flex items-center gap-2">
                <AppIcon name="copy" :size="13" class="text-warn" />
                <h3 class="text-[12.5px] font-medium text-ink">
                  Secretos reutilizados
                  <span class="text-faint tabular-nums"
                    >({{ reusedGroups.length }})</span
                  >
                </h3>
              </div>
              <div
                v-for="(group, index) in reusedGroups"
                :key="index"
                class="mt-2.5 border-l-2 border-warn/50 bg-raised px-3 py-2.5"
              >
                <p class="text-[11.5px] text-muted tabular-nums">
                  {{ group.count }} credenciales comparten el mismo secreto
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    v-for="item in group.items"
                    :key="item.id"
                    type="button"
                    class="chip px-2 text-[11px] sm:h-6"
                    @click="emit('open', item.id)"
                  >
                    {{ categoryLabel(item) }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="staleItems.length" class="py-4">
              <div class="flex items-center gap-2">
                <AppIcon name="refresh" :size="13" class="text-warn" />
                <h3 class="text-[12.5px] font-medium text-ink">
                  Secretos antiguos
                  <span class="text-faint tabular-nums"
                    >({{ staleItems.length }})</span
                  >
                </h3>
              </div>
              <ul class="mt-2">
                <li v-for="item in staleItems" :key="item.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-field px-2 py-3.5 text-left transition-colors duration-150 hover:bg-raised sm:py-1.5"
                    @click="emit('open', item.id)"
                  >
                    <span class="size-1.5 shrink-0 rounded-full bg-warn" />
                    <span
                      class="min-w-0 flex-1 truncate text-[12.5px] text-ink"
                    >
                      {{ categoryLabel(item) }}
                    </span>
                    <span class="truncate text-[11px] text-faint">
                      {{ item.username || 'Sin usuario' }}
                    </span>
                    <AppIcon
                      name="chevronRight"
                      :size="12"
                      class="text-faint"
                    />
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <p
          class="mt-6 flex items-start gap-1.5 border-t border-line pt-4 text-[11px] leading-relaxed text-faint"
        >
          <AppIcon name="shield" :size="12" class="mt-px shrink-0" />
          Evaluado en local en este dispositivo. La fuerza es una estimación
          según longitud y variedad de caracteres; no es una garantía.
        </p>
      </div>
    </div>
  </div>
</template>
