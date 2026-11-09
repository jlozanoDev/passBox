# Passbox S3 Backend — Feature Document

Objective: Replace the Google Drive sync backend with a generic S3-compatible transport (BYO static credentials, no OAuth), preserving the zero-knowledge vault wire format and sync semantics.
Branch: `feature/passbox-core` (v1.0 closed at 7dfb0ac; tree was clean at feature start). Delivery: auto-chain, feature-branch-chain slices; push/PR remain human-owned. Test runner: `vitest` + `npm run lint`.

Supersedes specs S5, S8 and the cloud-client half of S11 of `odd/tasks/passbox.md` (v1.0 record, kept as history).

## Specs

### S1 — S3-compatible backend, BYO static credentials

User requirement, verbatim:

> "Definitivamente lo hacemos para S3"

Acceptance: vault sync talks the S3-compatible object API using user-provided values: endpoint URL, region, bucket, access key ID, secret access key. The same build must work against AWS S3, Backblaze B2, Cloudflare R2 and MinIO with no code change (custom endpoint + path-style addressing). Assumption (flagged): "generic S3-compatible, not AWS-only" is the agent-recommended option the user selected when choosing S3; any single provider works through the same form.

### S2 — No OAuth; secret at rest encrypted

Acceptance: no OAuth flow, loopback server, consent screen or token refresh; the secret access key is encrypted with the vault session key (`vault-store.encryptSessionData`) before persistence and decrypted only in memory when constructing the S3 client; plaintext secret never touches disk; endpoint, region, bucket and access key ID are stored as non-sensitive config.

### S3 — Sync semantics preserved (RF-03, verbatim from v1.0 S3)

> "Al abrir la app, se debe comprobar si existe una versión más reciente del archivo en la nube y descargarla."
> "Al realizar cualquier modificación (crear, editar, eliminar un secreto), el archivo cifrado debe subirse automáticamente a la nube."

Acceptance: unchanged observable behavior via the S3 transport — `download()` returns the remote envelope or `null`; `upload(envelope)` PUTs the object; sync orchestration (15s timeout, lineage verification, conflict deferral, offline never blocks unlock) stays intact. Wire format unchanged: JSON envelope `{salt, iv, authTag, ciphertext}` (v1.0 S10).

### S4 — Cloud isolation (adapted from v1.0 S8)

v1.0 S8 verbatim (Google-specific, superseded):

> "El archivo en Google Drive debe residir estrictamente en el directorio oculto appDataFolder, impidiendo que el usuario lo modifique o borre por accidente desde la interfaz web de Drive."

Adaptation: the remote vault exists only as the fixed object key `passbox.vault` inside the user-designated bucket; Passbox never lists, reads or writes any other key; the bucket stays private per provider defaults (user-facing web UI of the provider never exposes the object to accidental deletion by Passbox actions; the user retains full control of their bucket).

### S5 — Stack change (adapted from v1.0 S11)

v1.0 S11 cloud-client clause verbatim (superseded):

> "Cliente Cloud: googleapis (Node SDK oficial para Google Drive API v3)"

Change: remove `googleapis` and `google-auth-library`; add `@aws-sdk/client-s3`. `electron-store` continues to hold only non-sensitive prefs; sync-last state shape unchanged.

### S6 — Settings UI

Acceptance: `DriveSettings.vue` becomes a credential form — endpoint, region, bucket, access key ID, secret access key — with a Connect action that validates against the provider (HeadBucket) and surfaces sync state as today; the OAuth "connect with Google" button and client id/secret paste are removed. UI copy in English.

## Tasks

| ID  | Spec   | Route  | Status | Commit / evidence                                                                         |
| --- | ------ | ------ | ------ | ----------------------------------------------------------------------------------------- |
| T1  | S1, S3 | inline | done   | 93937c2 (RED→GREEN, 13 tests)                                                             |
| T2  | S2     | inline | done   | 6f4cff1 (RED→GREEN, 6 tests)                                                              |
| T3  | S3, S6 | inline | done   | 37f956e (RED→GREEN, 8 tests; suite 102/102)                                               |
| T4  | S1, S5 | inline | done   | eade71b (Google removal, −1545 lines, deps swapped; README + package description)         |
| T5  | all    | inline | done   | suite 73/73, lint clean, `npm run package` OK; assess 7dfb0ac..HEAD = medium/under_budget |

Route evidence: units are sequential (each depends on the previous), so no parallel-writer reason; parent writes inline following this logbook.

## Log

### L1 — Original request (verbatim, 2026-10-31)

> "Es muy complicado conectar google drive, que otra servicio puedo utilizar para subir el fichero encriptado, y en otro ordenador obtenerlo"

### L2 — Backend decision chain (verbatim, 2026-10-31)

> "me gusta la idea de dropbox, dime como crear app en dropbox"
> "no no me gusta eso de las 4h, entonces me inclino con amazon s3"
> "entonces con dropbox si no abro la aplicación en 1 semana, que ocurriria?"
> "Definitivamente lo hacemos para S3"

Evidence behind the final call: Dropbox access tokens expire in 4h but refresh tokens never expire (official docs; transparent to the user — same pattern Passbox already used for Google); Google BYO consent screens sit in "Testing" by default, which caps refresh tokens at 7 days — the real idle-use cliff was Google, not Dropbox. User still chose S3 for its zero-OAuth static-credential model. Known tradeoff accepted: S3 credentials take ~4-5 form values vs Dropbox's 2; the generic endpoint field keeps every S3-compatible provider viable (AWS, B2, R2, MinIO).

### L3 — Architecture notes (2026-10-31)

Transport contract consumed by `sync.js`: `download()` → envelope|null, `upload(envelope)` → confirmation; envelope shape gate `{salt, iv, authTag, ciphertext}` moves to a shared module. The session-secret rewrap in `adoptIfNewer` (v1.0 verifier B3) is provider-agnostic: S3 config exposes the same `getTokenBlob/setTokenBlob/clearToken` surface carrying the encrypted secret access key. Key caching (`fileId`) is Drive-only — S3 needs none (fixed object key), which deletes the stale-id/re-resolve paths entirely.

### L4 — Delivery evidence (2026-10-31)

Work units: 93937c2 (T1 transport, RED→GREEN 13 tests) · 6f4cff1 (T2 config, RED→GREEN 6 tests) · 37f956e (T3 rewire: service RED→GREEN 8 tests, `cloud:*` IPC, CloudSettings.vue, sync param rename; suite 102/102) · eade71b (T4 Google removal, −1545 lines, deps swapped). T5: suite 73/73 (29 Google tests removed with their modules), `npm run lint` clean, `npm run package` gate passed (Electron bundle compiles with @aws-sdk/client-s3). Native assess over 7dfb0ac..HEAD committed-only: risk=medium (configuration_change), review_due=false (under_budget) — boundary stays at 7dfb0ac. Risk line for the feature: item 2 (new secret-at-rest handling: S3 secret access key) and item 5 (dependency swap) → one independent verifier at feature end.
