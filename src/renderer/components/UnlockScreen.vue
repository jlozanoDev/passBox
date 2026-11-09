<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import AppIcon from './ui/AppIcon.vue';
import BrandMark from './ui/BrandMark.vue';
import StrengthMeter from './ui/StrengthMeter.vue';
import { estimateStrength } from '../lib/security-audit.js';

const props = defineProps({
  mode: {
    type: String,
    required: true, // 'create' | 'unlock'
  },
});

const emit = defineEmits(['authenticated']);

const password = ref('');
const confirmation = ref('');
const error = ref('');
const busy = ref(false);
const revealed = ref(false);
const capsLock = ref(false);
const passwordInput = ref(null);

const isCreate = computed(() => props.mode === 'create');
const strength = computed(() => estimateStrength(password.value));

onMounted(async () => {
  await nextTick();
  passwordInput.value?.focus();
});

function syncCapsLock(event) {
  if (typeof event.getModifierState === 'function') {
    capsLock.value = event.getModifierState('CapsLock');
  }
}

async function submit() {
  error.value = '';

  if (isCreate.value) {
    if (password.value.length < 8) {
      error.value = 'La contraseña maestra debe tener al menos 8 caracteres.';
      return;
    }
    if (password.value !== confirmation.value) {
      error.value = 'Las contraseñas no coinciden.';
      return;
    }
  }

  if (!password.value) {
    error.value = 'Introduce tu contraseña maestra.';
    return;
  }

  busy.value = true;
  try {
    const payload = isCreate.value
      ? await window.passbox.vaultCreate(password.value)
      : await window.passbox.vaultUnlock(password.value);
    emit('authenticated', payload);
  } catch {
    error.value = 'Contraseña maestra incorrecta.';
  } finally {
    busy.value = false;
    password.value = '';
    confirmation.value = '';
  }
}
</script>

<template>
  <div
    class="relative grid min-h-screen place-items-center overflow-hidden p-5"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-line"
    />

    <div class="animate-rise relative w-full max-w-[380px]">
      <div class="flex flex-col items-center text-center">
        <span
          class="grid size-12 place-items-center rounded-[14px] bg-ink text-canvas shadow-card"
        >
          <BrandMark :size="26" />
        </span>
        <h1 class="mt-4 text-[19px] font-semibold tracking-[-0.02em] text-ink">
          Passbox
        </h1>
        <p class="mt-1 text-[12.5px] text-muted">
          Tu bóveda, cifrada en este dispositivo.
        </p>
      </div>

      <form
        class="card mt-6 p-5 shadow-card"
        novalidate
        @submit.prevent="submit"
      >
        <div>
          <h2 class="text-[14px] font-semibold tracking-tight text-ink">
            {{ isCreate ? 'Crea tu bóveda' : 'Desbloquea tu bóveda' }}
          </h2>
          <p class="mt-1 text-[12px] leading-relaxed text-muted">
            {{
              isCreate
                ? 'Elige una contraseña maestra. No se almacena y nunca sale de este dispositivo.'
                : 'Introduce tu contraseña maestra para descifrar tus credenciales.'
            }}
          </p>
        </div>

        <div class="mt-5">
          <label for="master-password" class="label">Contraseña maestra</label>
          <div class="relative mt-1.5">
            <input
              id="master-password"
              ref="passwordInput"
              v-model="password"
              :type="revealed ? 'text' : 'password'"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'unlock-error' : undefined"
              class="field pr-10"
              @keydown="syncCapsLock"
              @keyup="syncCapsLock"
              @input="syncCapsLock"
            />
            <button
              type="button"
              class="row-action absolute top-1/2 right-1.5 -translate-y-1/2"
              :aria-label="
                revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'
              "
              :aria-pressed="revealed"
              @click="revealed = !revealed"
            >
              <AppIcon :name="revealed ? 'eyeOff' : 'eye'" :size="15" />
            </button>
          </div>
        </div>

        <div v-if="isCreate" class="mt-3.5">
          <label for="master-confirmation" class="label"
            >Confirmar contraseña</label
          >
          <input
            id="master-confirmation"
            v-model="confirmation"
            :type="revealed ? 'text' : 'password'"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="field mt-1.5"
            @keydown="syncCapsLock"
            @keyup="syncCapsLock"
          />
        </div>

        <div v-if="isCreate && password" class="mt-3">
          <StrengthMeter :score="strength.score" />
          <p class="hint mt-1.5">
            Usa al menos 8 caracteres. Una frase de paso más larga es más
            fuerte.
          </p>
        </div>

        <p
          v-if="capsLock"
          class="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-warn"
        >
          <AppIcon name="alert" :size="12" />
          Bloq Mayús está activado.
        </p>

        <p
          v-if="error"
          id="unlock-error"
          role="alert"
          class="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-soft px-2.5 py-2 text-[11.5px] leading-relaxed font-medium text-danger"
        >
          <AppIcon name="alert" :size="12" class="mt-px shrink-0" />
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="busy"
          class="btn btn-primary btn-lg mt-5 w-full"
        >
          <AppIcon v-if="busy" name="refresh" :size="14" class="animate-spin" />
          {{
            busy
              ? isCreate
                ? 'Creando bóveda…'
                : 'Desbloqueando…'
              : isCreate
                ? 'Crear bóveda'
                : 'Desbloquear'
          }}
        </button>
      </form>

      <p
        class="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-faint"
      >
        <AppIcon name="lock" :size="11" />
        Conocimiento cero: tu contraseña maestra nunca se almacena.
      </p>
    </div>
  </div>
</template>
