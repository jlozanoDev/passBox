# Passbox — Feature Document

Objective: Build Passbox v1.0, a local-first, zero-knowledge Electron desktop password/secret manager that syncs an encrypted vault through the user's personal Google Drive (`appDataFolder`).
Branch: `feature/passbox-core` (from `main`). Delivery: work-unit commits on the feature branch; push/PR remain human-owned. Test runner: `vitest` (unit) + `npm run build` (Vite/Forge type/build gate).

## Specs

### S1 — Master password (RF-01)

User requirement, verbatim:

> "El sistema debe requerir una Contraseña Maestra en el primer arranque para inicializar el almacén, o en cada inicio de sesión posterior para descifrarlo."
> "La contraseña maestra nunca debe almacenarse en disco, base de datos ni enviarse por la red."

Acceptance: first launch prompts to create the master password (with confirmation); later launches prompt to unlock; the password exists only in process memory during a session and is never written to disk or sent over any network.

### S2 — Local encrypted vault (RF-02)

> "Todos los secretos deben residir en un único archivo cifrado local (passbox.vault)."

Acceptance: exactly one local file `passbox.vault` holds all secrets in encrypted form; no plaintext secret ever touches disk.

### S3 — Automatic cloud sync (RF-03)

> "Al abrir la app, se debe comprobar si existe una versión más reciente del archivo en la nube y descargarla."
> "Al realizar cualquier modificación (crear, editar, eliminar un secreto), el archivo cifrado debe subirse automáticamente a la nube."

Acceptance: on app open the cloud copy is checked and downloaded when newer; every mutation (create/edit/delete) triggers an automatic upload of the encrypted file.

### S4 — Secret CRUD (RF-04)

> "Capacidad de añadir, listar, editar y eliminar entradas estructuradas (Título, Usuario/Identificador, Valor/Secreto, Categoría, Notas, Fecha de modificación)."

Acceptance: create, list, edit and delete entries with the fields Título, Usuario/Identificador, Valor/Secreto, Categoría, Notas, Fecha de modificación.

### S5 — Google authentication (RF-05)

> "Flujo de autenticación OAuth 2.0 seguro para vincular la cuenta de Google del usuario mediante un servidor loopback local."

Acceptance: OAuth 2.0 flow links the user's Google account via a local loopback server; no embedded credentials in the client.

### S6 — Confidentiality (RNF-01)

> "Uso del algoritmo AES-256-GCM (Galois/Counter Mode), que garantiza tanto la cifrado de los datos como su integridad (autenticación)."

Acceptance: all vault payloads are encrypted with AES-256-GCM (authenticated encryption; tampering is detected on decrypt).

### S7 — Key derivation (RNF-02)

> "Uso de PBKDF2 (con un mínimo de 100,000 iteraciones y un salt aleatorio de 16 bytes) para transformar la contraseña maestra en la clave de cifrado simétrica de 256 bits."

Acceptance: PBKDF2 with ≥100,000 iterations, a random 16-byte salt, output key length 32 bytes (AES-256). Salt is generated once per vault and travels with the vault file.

### S8 — Cloud isolation (RNF-03)

> "El archivo en Google Drive debe residir estrictamente en el directorio oculto appDataFolder, impidiendo que el usuario lo modifique o borre por accidente desde la interfaz web de Drive."

Acceptance: the Drive file is created/updated only inside `appDataFolder` (hidden from the normal Drive UI).

### S9 — Memory hygiene (RNF-04)

> "Limpiar o sobrescribir las variables en memoria RAM que contengan la clave maestra o los secretos al cerrar la sesión o bloquear la aplicación."

Acceptance: on lock/close, master key material and decrypted secrets are overwritten/cleared from memory as far as Node.js allows (buffers zeroed, references dropped).

### S10 — Vault schema

Plaintext payload after decryption (verbatim from the spec):

```json
{
  "version": "1.0.0",
  "salt": "base64_encoded_salt_string",
  "updatedAt": "2026-10-30T20:00:00.000Z",
  "items": [
    {
      "id": "uuid-v4-string",
      "title": "Stripe Production API Key",
      "category": "api_token",
      "username": "admin@project.com",
      "secret": "sk_live_51M...",
      "notes": "Usar solo en entornos productivos de pasarela de pagos.",
      "createdAt": "2026-10-30T20:00:00.000Z",
      "updatedAt": "2026-10-30T20:00:00.000Z"
    }
  ]
}
```

Encrypted envelope on disk/network (verbatim):

```json
{
  "iv": "base64_iv",
  "authTag": "base64_tag",
  "ciphertext": "base64_encrypted_payload"
}
```

Assumption (engineering necessity, flagged): the `salt` field is inside the encrypted payload per the spec, but key derivation requires the salt _before_ decryption. Therefore the envelope carries `salt` alongside `iv`/`authTag`/`ciphertext` in plaintext (salt is public by design); the decrypted payload keeps the schema above unchanged. No user-visible behavior changes.

### S11 — Stack (spec §6)

> "Core de Escritorio: Electron (Node.js + Chromium)" · "Empaquetador: Vite + Electron Forge" · ~~"Frontend: React"~~ → **Frontend: Vue 3** (user override, see Log L2), "con Tailwind CSS para un diseño minimalista, plano y de tonos limpios" · "Criptografía: Módulo nativo crypto de Node.js (crypto.scrypt / crypto.pbkdf2 y crypto.createCipheriv)" · "Cliente Cloud: googleapis (Node SDK oficial para Google Drive API v3)" · "Almacenamiento Local en Caché: electron-store (para configuraciones no sensibles como preferencias de UI o estado de la última sincronización)."

Acceptance: the implemented stack matches this list with **Vue 3** as the frontend framework (PBKDF2 is the mandated derivation per S7; `googleapis` for Drive; `electron-store` only for non-sensitive prefs).

### S12 — Phases (spec §7)

> "Fase 1: Configuración del Core y UI Base" · "Fase 2: Motor Criptográfico Local" · "Fase 3: Integración con Google Drive API" · "Fase 4: Sincronización y Pruebas"

Acceptance: work proceeds in this order; each phase's artifacts are delivered and checked before the next. Fase 1 initializes the repository with Electron + Vite + **Vue** (user override, Log L2).

## Tasks

| ID  | Spec                          | Route  | Status  | Commit / evidence |
| --- | ----------------------------- | ------ | ------- | ----------------- |
| T1  | S11, S12                      | inline | done    | 9b041a7           |
| T2  | S12 (Fase 1), S4 (UI surface) | inline | pending | —                 |
| T3  | S6, S7, S10                   | inline | done    | 3818cd9           |
| T4 | S1, S2, S9, S10 | inline | done | (this commit) |
| T5  | S5                            | inline | pending | —                 |
| T6  | S8, S3 (upload/download)      | inline | pending | —                 |
| T7  | S4, S3 (auto-sync)            | inline | pending | —                 |
| T8  | S3 (conflicts by `updatedAt`) | inline | pending | —                 |
| T9  | S12 (Fase 4 packaging)        | inline | pending | —                 |

Notes on routes: all tasks are currently planned inline (small-to-medium understood changes in a greenfield repo; no writer trigger — no parallel independent units launched together and no context backstop reached). Re-evaluate if a task grows past the inline budget.

## Log

- L1 (user, 2026-10-30) — original request, verbatim:
  "Aquí tienes el Documento de Especificaciones Técnicas Completo para Passbox, estructurado de forma profesional para que sirva como guía de desarrollo de principio a fin.

  Documento de Especificaciones Técnicas: Passbox (v1.0)
  1. Visión General del Proyecto
     Passbox es una aplicación de escritorio multiplataforma (Windows, macOS, Linux) de código abierto y arquitectura Local-First, diseñada para almacenar y sincronizar de forma centralizada contraseñas, tokens de API y secretos de desarrollo utilizando el espacio en la nube personal del usuario (Google Drive / Google One) como un disco duro remoto "ciego".

  2. Arquitectura del Sistema
     La arquitectura sigue un modelo de Zero-Knowledge Architecture (Cifrado de Extremo a Extremo). Ni el proveedor cloud (Google) ni ningún intermediario tienen acceso a los datos en texto plano.

  [ Electron Renderer (UI: React / Tailwind) ]
  │ (IPC / ContextBridge)
  ▼
  [ Electron Main Process (Node.js) ]
  ├── Módulo Criptográfico (AES-256-GCM + PBKDF2)
  ├── Gestor de Sincronización Local (Cache temporal)
  └── Cliente Cloud (Google Drive API - appDataFolder)
  │
  ▼
  [ Nube Personal: passbox.vault (Cifrado Binario) ]

  3. Requisitos Funcionales
     RF-01: Gestión de Contraseña Maestra: El sistema debe requerir una Contraseña Maestra en el primer arranque para inicializar el almacén, o en cada inicio de sesión posterior para descifrarlo. La contraseña maestra nunca debe almacenarse en disco, base de datos ni enviarse por la red.
     RF-02: Almacenamiento Local Cifrado (Vault): Todos los secretos deben residir en un único archivo cifrado local (passbox.vault).
     RF-03: Sincronización Cloud Automática: Al abrir la app, se debe comprobar si existe una versión más reciente del archivo en la nube y descargarla. Al realizar cualquier modificación (crear, editar, eliminar un secreto), el archivo cifrado debe subirse automáticamente a la nube.
     RF-04: CRUD de Secretos: Capacidad de añadir, listar, editar y eliminar entradas estructuradas (Título, Usuario/Identificador, Valor/Secreto, Categoría, Notas, Fecha de modificación).
     RF-05: Autenticación con Google: Flujo de autenticación OAuth 2.0 seguro para vincular la cuenta de Google del usuario mediante un servidor loopback local.

  4. Requisitos No Funcionales y Seguridad
     RNF-01: Confidencialidad: Uso del algoritmo AES-256-GCM (Galois/Counter Mode), que garantiza tanto la cifrado de los datos como su integridad (autenticación).
     RNF-02: Derivación de Claves: Uso de PBKDF2 (con un mínimo de 100,000 iteraciones y un salt aleatorio de 16 bytes) para transformar la contraseña maestra en la clave de cifrado simétrica de 256 bits.
     RNF-03: Aislamiento en la Nube: El archivo en Google Drive debe residir estrictamente en el directorio oculto appDataFolder, impidiendo que el usuario lo modifique o borre por accidente desde la interfaz web de Drive.
     RNF-04: Gestión de Memoria: Limpiar o sobrescribir las variables en memoria RAM que contengan la clave maestra o los secretos al cerrar la sesión o bloquear la aplicación.

  5. Especificación del Formato de Datos (Vault Schema)
     [JSON schema of passbox.vault plaintext payload: version 1.0.0, salt, updatedAt, items[] with id/title/category/username/secret/notes/createdAt/updatedAt — example item "Stripe Production API Key" / api_token / admin@project.com / sk_live_51M... / "Usar solo en entornos productivos de pasarela de pagos."]
     [Encrypted envelope: iv, authTag, ciphertext — base64 fields.]

  6. Stack Tecnológico
     Core de Escritorio: Electron (Node.js + Chromium)
     Empaquetador: Vite + Electron Forge
     Frontend: React (con Tailwind CSS para un diseño minimalista, plano y de tonos limpios)
     Criptografía: Módulo nativo crypto de Node.js (crypto.scrypt / crypto.pbkdf2 y crypto.createCipheriv)
     Cliente Cloud: googleapis (Node SDK oficial para Google Drive API v3)
     Almacenamiento Local en Caché: electron-store (para configuraciones no sensibles como preferencias de UI o estado de la última sincronización).

  7. Plan de Fases de Desarrollo
     Fase 1: Configuración del Core y UI Base — Inicializar el repositorio Electron + Vite + React. Diseñar la interfaz principal (lista de elementos, barra de búsqueda, modal de creación de secretos).
     Fase 2: Motor Criptográfico Local — Implementar las funciones de derivación de clave (PBKDF2) y cifrado/descifrado simétrico (AES-256-GCM). Validar el flujo de la Contraseña Maestra en memoria.
     Fase 3: Integración con Google Drive API — Configurar credenciales de API en Google Cloud Console (OAuth Client ID). Implementar el flujo de autenticación loopback en Electron. Programar las funciones de subida y descarga del archivo hacia el appDataFolder.
     Fase 4: Sincronización y Pruebas — Gestión de conflictos básicos por marcas de tiempo (updatedAt). Pruebas multiplataforma de empaquetado con Electron Forge."

- L2 (user, 2026-10-30) — correction, verbatim: "un cambio importante, en vez de reac, tiene que ser en vue"
  Effect: frontend framework changes from React to **Vue 3**. Affects S11 (stack) and S12 (Fase 1 scaffold). Everything else unchanged (Electron, Vite, Electron Forge, Tailwind CSS, Node crypto, googleapis, electron-store).

- L3 (dev, 2026-10-30) — crypto decision: PBKDF2 iterations set to **600,000** (spec mandates a minimum of 100,000; 600k follows current OWASP guidance for PBKDF2-SHA256 and still satisfies RNF-02). Vitest added as the unit test runner; T3 tests observed RED (missing module) → GREEN (6/6 pass).
