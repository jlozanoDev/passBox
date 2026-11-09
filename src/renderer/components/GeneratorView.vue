<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import StrengthMeter from './ui/StrengthMeter.vue';
import {
  MAX_LENGTH,
  MIN_LENGTH,
  generatePassword,
} from '../lib/password-generator.js';
import { estimateStrength } from '../lib/security-audit.js';
import { copyText } from '../lib/clipboard.js';
import { useToast } from '../composables/useToast.js';

const { toast } = useToast();

const options = reactive({
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
});

const password = ref('');
const copied = ref(false);

const characterClasses = [
  { key: 'upper', label: 'Mayúsculas', hint: 'A–Z', sample: 'ABCDEF' },
  { key: 'lower', label: 'Minúsculas', hint: 'a–z', sample: 'abcdef' },
  { key: 'digits', label: 'Números', hint: '0–9', sample: '123456' },
  { key: 'symbols', label: 'Símbolos', hint: '!@#$', sample: '!@#$%^' },
];

const strength = computed(() => estimateStrength(password.value));
const enabledCount = computed(
  () => characterClasses.filter((entry) => options[entry.key]).length,
);

function regenerate() {
  try {
    password.value = generatePassword({ ...options });
    copied.value = false;
  } catch {
    toast('Activa al menos un conjunto de caracteres', { tone: 'error' });
  }
}

function toggle(key) {
  if (options[key] && enabledCount.value === 1) {
    toast('Mantén activado al menos un conjunto de caracteres', {
      tone: 'error',
    });
    return;
  }
  options[key] = !options[key];
}

async function copy() {
  if (!password.value) return;
  const ok = await copyText(password.value, { sensitive: true });
  if (ok) {
    copied.value = true;
    toast('Contraseña copiada · se borra en 30 s', { tone: 'secure' });
    setTimeout(() => {
      copied.value = false;
    }, 1600);
  } else {
    toast('Portapapeles no disponible', { tone: 'error' });
  }
}

watch(options, regenerate);
onMounted(regenerate);
</script>

<template>
  <div class="scroll-area h-full overflow-y-auto">
    <div class="w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section class="card flex flex-col p-5">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="panel-title">Contraseña generada</h2>
              <p class="mt-0.5 text-[11.5px] text-faint">
                Creada en local con la API Web Crypto.
              </p>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="regenerate"
            >
              <AppIcon name="refresh" :size="13" />
              Regenerar
            </button>
          </div>

          <div
            class="mt-4 flex min-h-[92px] items-center rounded-field border border-line bg-raised px-4 py-3"
          >
            <output
              class="mono w-full break-all text-[15px] leading-relaxed text-ink"
              aria-live="polite"
            >
              {{ password }}
            </output>
          </div>

          <div class="mt-4">
            <StrengthMeter :score="strength.score" />
            <p class="hint mt-2">
              Estimación según longitud y variedad de caracteres. Guárdala en tu
              bóveda: Passbox no almacena aquí los valores generados.
            </p>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary" @click="copy">
              <AppIcon :name="copied ? 'check' : 'copy'" :size="14" />
              {{ copied ? 'Copiada' : 'Copiar contraseña' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="regenerate">
              <AppIcon name="wand" :size="14" />
              Nueva contraseña
            </button>
          </div>
        </section>

        <section
          class="border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
        >
          <h2 class="panel-title">Opciones</h2>

          <div class="mt-4">
            <div class="flex items-center justify-between">
              <label for="generator-length" class="label">Longitud</label>
              <span
                class="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink"
              >
                {{ options.length }}
              </span>
            </div>
            <input
              id="generator-length"
              v-model.number="options.length"
              type="range"
              :min="MIN_LENGTH"
              :max="MAX_LENGTH"
              step="1"
              class="range mt-1.5"
            />
            <div
              class="mt-1 flex justify-between text-[10px] text-faint tabular-nums"
            >
              <span>{{ MIN_LENGTH }}</span>
              <span>{{ MAX_LENGTH }}</span>
            </div>
          </div>

          <div class="mt-4 space-y-0.5 border-t border-line pt-2">
            <button
              v-for="entry in characterClasses"
              :key="entry.key"
              type="button"
              role="switch"
              :aria-checked="options[entry.key]"
              class="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left transition-colors duration-150 hover:bg-raised"
              @click="toggle(entry.key)"
            >
              <span class="min-w-0">
                <span class="block text-[12.5px] font-medium text-ink">
                  {{ entry.label }}
                </span>
                <span class="mono block text-[10.5px] text-faint">
                  {{ entry.sample }}
                </span>
              </span>
              <span
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150"
                :class="options[entry.key] ? 'bg-accent' : 'bg-sunken'"
                aria-hidden="true"
              >
                <span
                  class="absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] duration-150"
                  :class="options[entry.key] ? 'left-[18px]' : 'left-0.5'"
                />
              </span>
            </button>
          </div>

          <p class="hint mt-3 border-t border-line pt-3">
            {{ enabledCount }} de 4 conjuntos activos. Siempre se mantiene al
            menos uno activo.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
