# Passbox Supabase Backend — Feature Document

Objective: Replace the S3 object-sync backend with a Supabase Postgres store — one row per secret, client-side encrypted, BYO Supabase credentials, automatic schema migration when the database is empty. Multi-client (2+ Passbox on the same DB) must read each other's rows when they share the master password.
Branch: `feature/passbox-core`. Delivery: auto-chain, feature-branch-chain slices; push/PR remain human-owned. Test runner: `vitest` + `npm run lint`.

Supersedes the S3 transport specs of `odd/tasks/passbox-s3-backend.md` (record kept as history).

## Specs

### S1 — BYO Supabase credentials in the app

User requirement, verbatim:

> "hay que introducir las credenciales de supabase en la aplicacion"

Acceptance: the settings UI collects **Project URL + session-pooler connection string** only. Connection string stored encrypted at rest via `vault-store.encryptSessionData`; URL stored as non-sensitive config. No bundled credentials. **Amended A1 (2026-11-09, user: "si quitalo"):** service-role/secret API key removed from the form and from `connect()` — auth is the Postgres URI alone (API-key deprecation does not apply to the pooler).

### S2 — One row per password; values encrypted in the client

User requirement, verbatim:

> "1"

(choice: ciphertext per row — never plaintext in the database)

Acceptance: each secret is a Postgres row. The secret value never leaves the client as plaintext: column(s) hold `{ciphertext, iv, authTag}` (same envelope primitives as today's vault). Non-sensitive columns may hold id, type/label metadata, `updated_at`. Supabase cannot read secret values.

### S3 — Multi-client readable with the same master password

User requirement, verbatim:

> "si tengo 2 passbox conectados a la misma bd, podrá leerlas correctamente?"

Acceptance: two Passbox instances with the **same master password** and the **same Supabase project** derive the same data key (shared non-sensitive salt stored in the DB or first-write row) and can decrypt each other's rows. A client with a different master password cannot decrypt them. Design assumption (flagged): no multi-user sharing, no per-device key wrapping in v1 — single user, N devices, one master password.

### S4 — Migrations when the database does not exist / is empty

User requirement, verbatim:

> "habrá que hacer migraciones necesarias etc, si no existe la base de datos"

Acceptance: on Connect (or first sync), the app ensures the schema exists: `CREATE TABLE IF NOT EXISTS` (or equivalent idempotent migration) for the secrets table + any salt/metadata row. Missing DB objects are created automatically; existing data is never dropped. Migration runs are idempotent.

### S5 — Connect and read all existing passwords

User requirement, verbatim:

> "que se conecte a todas la pass que existe"

Acceptance: after connect, the app lists/loads every secret row the credentials can read and the master password can decrypt; local vault session (unlock, save) operates on the row set. First-run against an empty table starts with zero secrets (no error).

### S6 — Stack change

Remove `@aws-sdk/client-s3`. Add Supabase client (`@supabase/supabase-js`) or a thin Postgres/REST client with the same effect. `electron-store` keeps non-sensitive prefs only; sync-last diagnostics shape stays. UI copy in English.

### S7 — Settings UI

Acceptance: `CloudSettings.vue` becomes a Supabase credential form (URL + key) with Connect that validates (e.g. ping/migration probe) and surfaces last-sync state. S3 endpoint/region/bucket/accessKey fields are removed.

### S8 — Existing local vault import (assumption)

Assumption (flagged): a machine that already has a local encrypted vault imports its secrets into rows on first successful connect (one-time or until table is empty for that vault lineage), so "all existing passwords" survive the backend swap. If the user has no local vault, connect starts clean.

## Tasks

| ID  | Spec   | Route  | Status | Commit / evidence |
| --- | ------ | ------ | ------ | ----------------- |
| T1  | S1, S4 | inline | done   | RED→GREEN 14 tests (supabase-config + supabase-migrate); `postgres` dep added |
| T2  | S2, S3 | inline | done   | RED→GREEN 10 tests (row-crypto: shared salt, multi-client decrypt, wrong-password reject) |
| T3  | S5, S8 | inline | done   | RED→GREEN 10 tests (salt bootstrap, list/upsert/soft-delete, import ciphertext-only); suite 107/107 |
| T4  | S6, S7 | inline | done   | RED→GREEN 12 tests (supabase-cloud connect/open/upload); S3 modules removed; suite 67/67 |
| T5  | all    | inline | done   | suite 67/67, `npm run package` OK, oxlint clean on new files; feature close |

Route evidence: units are sequential (crypto before CRUD, CRUD before rewire); no parallel-writer reason; parent writes inline following this logbook.

## Log

### L1 — Original request (verbatim, 2026-11-09)

> "Otro cambio, se me complico S3. contextualizate: /odd, vamos a cambiarlo y que la aplicación se conecte con una base de datos supabase, igual, hay que introducir las credenciales de supabase en la aplicacion y que se conecte a todas la pass que existe, habrá que hacer migraciones necesarias etc, si no existe la base de datos"

### L2 — Architecture choice (verbatim, 2026-11-09)

> "B"  (passwords as rows in Postgres — not a single blob transport)

> "1, pero hay algo que me preocupa, si tengo 2 passbox conectados a la misma bd, podrá leerlas correctamente?"

Answered: yes with shared master password + shared salt; different master password cannot decrypt. Recorded as S3.

### L3 — Architecture notes (2026-11-09)

Transport contract today (`sync.js` → `s3-files.js`): `download()`/`upload(envelope)` for one object. New contract: row CRUD (`list`, `upsert`, `delete`) keyed by secret id; envelope shape gate stays per secret value. Session-secret rewrap (`adoptIfNewer`, `getTokenBlob`) keeps the same surface but carries the Supabase secret key instead of the S3 secret. Key derivation: master password + shared salt → data key; salt is non-sensitive and shared so two clients agree. Rekey on master-password change re-encrypts all rows.

### L4 — Delivery evidence (2026-11-09)

Work units: a43353a (T1 config+migrator, RED→GREEN 14) · 85689bc (T2 row-crypto, RED→GREEN 10) · 0e8e25d (T3 store, RED→GREEN 10) · 23471ad (T4 rewire, RED→GREEN 12 cloud tests, S3 removed −2080 lines) · 498ff06/23cad5f (lint cleanups) · f636904 (doc close). T5: suite 67/67, `npm run package` OK (Electron bundles with `postgres`), oxlint clean on new/changed src files. Pre-existing `oxfmt --check` redness on `odd/tasks/*.md` and older renderer files remains (baseline debt, not this feature). Native assess d246216..HEAD: risk=medium (configuration_change), review_due=false (under_budget). Risk line: item 2 (secret-at-rest: Supabase service key + database connection URL) and item 5 (dependency swap: −`@aws-sdk/client-s3`, +`postgres`) → one independent verifier at feature end.

### L5 — Independent verification + correction (2026-11-09)

Feature-end verifier: **FAIL → 3 blockers**, all fixed in one correction batch (`16bbc8b`), regression tests committed:

- **B1**: `uploadAfterSave` soft-deleted every remote row absent from local payload — a peer's new row vanished on the other device's save. Fix: only soft-delete ids in `knownRemoteIds` (pulled at last open) and only when not newer than local; peer rows never seen are left alone.
- **B2**: one undecryptable row aborted the whole pull (0 items, offline). Fix: per-row try/catch in `pullItems` — skip foreign/corrupt ciphertext, keep the rest.
- **B3**: `connect()` reset lineage and never imported; next save refused with `lineage-unverified` and the cloud held 0 passwords. Fix: `connect(credentials, {masterPassword})` bootstraps `open()` immediately while unlocked; `main.js` keeps the master password in memory only while unlocked (cleared on lock/quit). Also persist a `pulled` merge to the local vault file (advisory A2).

Post-correction suite: **72/72**. Advisories left open (non-blocking): A3 migrator export unused, A4 timeout does not cancel the query, A5 non-uuid ids fail the uuid column. **A1 resolved (2026-11-09, user: "si quitalo"):** service-key field removed from UI/`connect()`/config — only Project URL + session-pooler connection string remain.
