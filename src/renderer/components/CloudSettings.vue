<script setup>
import { computed, onMounted, ref } from 'vue';
import AppIcon from './ui/AppIcon.vue';

const emit = defineEmits(['changed']);

const status = ref({
  hasCredentials: false,
  connected: false,
  settings: null,
});
const lastSync = ref(null);
const projectUrl = ref('');
const databaseUrl = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');

async function refresh() {
  const current = await window.passbox.cloudStatus();
  status.value = current;
  if (current.settings) {
    // Prefill non-secret fields only — the secret never round-trips.
    projectUrl.value = current.settings.projectUrl ?? '';
  }
  lastSync.value = (await window.passbox.cloudSyncStatus()).lastSync;
}

// Map recorded sync reasons to plain-language states.
const syncState = computed(() => {
  const entry = lastSync.value;
  if (!entry) return null;
  const { ok, error: reason, at } = entry;
  const when = new Date(at).toLocaleString('es-ES');
  if (ok) return { tone: 'ok', text: `Última sincronización: ${when}` };
  if (reason === 'remote-newer') {
    return {
      tone: 'warn',
      text: 'Hay cambios más recientes en la nube; se fusionarán al volver a abrir Passbox.',
    };
  }
  if (reason === 'lineage-unverified') {
    return {
      tone: 'warn',
      text: 'La sincronización se reanudará tras la próxima comprobación correcta al abrir.',
    };
  }
  return { tone: 'warn', text: `La última sincronización falló (${when}).` };
});

onMounted(refresh);

async function connect() {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await window.passbox.cloudConnect({
      projectUrl: projectUrl.value.trim(),
      databaseUrl: databaseUrl.value.trim(),
    });
    // Connection string lives encrypted at rest from here on — drop it
    // from renderer memory immediately.
    databaseUrl.value = '';
    message.value = 'Sincronización conectada. El esquema está listo.';
    await refresh();
    emit('changed');
  } catch (err) {
    error.value = err?.message ?? 'No se pudo conectar.';
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  error.value = '';
  message.value = '';
  await window.passbox.cloudDisconnect();
  message.value = 'Desconectada.';
  await refresh();
  emit('changed');
}
</script>

<template>
  <section>
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-raised text-muted"
        >
          <AppIcon name="cloud" :size="16" />
        </span>
        <div>
          <h2 class="panel-title">Sincronización en la nube</h2>
          <p class="mt-0.5 max-w-sm text-[11.5px] leading-relaxed text-faint">
            {{
              status.connected
                ? 'Los secretos se sincronizan como filas cifradas en Supabase.'
                : 'URL del proyecto Supabase y cadena de conexión del session pooler.'
            }}
          </p>
        </div>
      </div>
      <span
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        :class="
          status.connected ? 'bg-ok-soft text-ok' : 'bg-sunken text-muted'
        "
      >
        <span
          class="size-1.5 rounded-full"
          :class="status.connected ? 'bg-ok' : 'bg-faint'"
        />
        {{ status.connected ? 'Conectada' : 'Sin conectar' }}
      </span>
    </div>

    <p
      v-if="status.connected && syncState"
      class="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[11.5px]"
      :class="syncState.tone === 'ok' ? 'text-muted' : 'text-warn'"
    >
      <AppIcon
        :name="syncState.tone === 'ok' ? 'check' : 'alert'"
        :size="12"
        class="shrink-0"
      />
      {{ syncState.text }}
    </p>

    <form
      v-if="!status.connected"
      class="mt-4 space-y-3 border-t border-line pt-4"
      @submit.prevent="connect"
    >
      <div>
        <label for="cloud-project-url" class="label">URL del proyecto</label>
        <input
          id="cloud-project-url"
          v-model="projectUrl"
          required
          placeholder="https://xxxx.supabase.co"
          autocomplete="off"
          spellcheck="false"
          class="field mt-1.5"
        />
      </div>
      <div>
        <label for="cloud-database-url" class="label">
          Cadena de conexión
        </label>
        <input
          id="cloud-database-url"
          v-model="databaseUrl"
          required
          type="password"
          placeholder="Cadena de conexión del session pooler"
          autocomplete="off"
          spellcheck="false"
          class="field mt-1.5 font-mono text-[12px]"
        />
      </div>
      <button type="submit" :disabled="busy" class="btn btn-secondary w-full">
        <AppIcon v-if="busy" name="refresh" :size="13" class="animate-spin" />
        {{ busy ? 'Conectando…' : 'Conectar sincronización' }}
      </button>
      <p class="hint">
        La cadena de conexión se cifra con la clave de tu bóveda antes de
        almacenarse. Los valores secretos se cifran en este dispositivo:
        Supabase solo almacena texto cifrado.
      </p>
    </form>

    <div v-else class="mt-4 border-t border-line pt-4">
      <p class="label">Proyecto</p>
      <p
        class="mono mt-1.5 truncate rounded-lg bg-raised px-3 py-2 text-[11.5px] text-muted"
      >
        {{ status.settings?.projectUrl }}
      </p>
      <button
        type="button"
        class="btn btn-secondary mt-3 w-full"
        @click="disconnect"
      >
        Desconectar
      </button>
      <p class="hint mt-3">
        Al desconectar se detienen las futuras sincronizaciones. El texto
        cifrado ya almacenado en Supabase permanece allí hasta que lo elimines.
      </p>
    </div>

    <p
      v-if="message"
      class="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-ok"
    >
      <AppIcon name="check" :size="12" />
      {{ message }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] leading-relaxed font-medium text-danger"
    >
      <AppIcon name="alert" :size="12" class="mt-px shrink-0" />
      {{ error }}
    </p>
  </section>
</template>
