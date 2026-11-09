# Passbox

Local-first, zero-knowledge secret manager for Windows, macOS and Linux. Stores passwords, API tokens and development secrets in an AES-256-GCM encrypted local vault and syncs them as **client-encrypted rows** in your own Supabase Postgres database. Connects with your **project URL + session-pooler connection string** (both stay yours — BYO); the connection string is stored encrypted at rest and secret values never leave the device as plaintext. Two devices with the same master password share one salt and can read each other's rows.

## Features

- **Vault** — search across title/username/category, category filter chips, favorites, credential detail with a masked secret, copy actions with feedback, inline editing and delete behind a confirmation that names the credential.
- **Password generator** — `crypto.getRandomValues` with rejection sampling (no modulo bias), length 8–64, per-character-class toggles that always keep at least one class, live strength estimate. Generated values are never stored.
- **Security center** — local-only audit of weak, reused and stale (>180 days) secrets. It returns identifiers and counts only and never renders or logs secret text; strength is labelled as an estimate, never as a guarantee.
- **Appearance** — light / dark / system theme, persisted in `localStorage` under `passbox.theme` (the only key the renderer writes).
- **Cloud sync (optional)** — encrypted rows in your own Supabase project; connection string encrypted with the vault key before storage.
- **Clipboard safety** — sensitive copies auto-clear after 30 s and only while the clipboard still holds the same value, compared by SHA-256 fingerprint (no plaintext retained by the timer).

## Interface

- **Language:** the UI copy is neutral, professional **Spanish** (`<html lang="es">`); code identifiers and comments stay English.
- **Design system:** one token layer in `src/renderer/index.css` — warm bone/ink light theme, warm charcoal dark theme, a single petrol-teal accent reserved for interactive/selected/focus/brand states, semantic status colours unchanged, no gradients. Components consume tokens only.
- **Typography:** IBM Plex Sans (UI) and IBM Plex Mono (secrets, usernames, timestamps, counts) bundled locally through Fontsource — no runtime network calls for fonts.
- **Layout:** typographic index sidebar from 1024 px, 64 px icon rail from 640 px, bottom navigation below 640 px; 44 px minimum touch targets on mobile; hairline-separated open sections instead of card grids; the credential detail reads as a dossier with the secret row as its anchor.
- **Brand:** original bracket mark (`src/renderer/components/ui/BrandMark.vue`) plus a reproducible application icon (see below).

## Stack

- Electron + Vite + Electron Forge
- Vue 3 + Tailwind CSS v4 (design tokens in `src/renderer/index.css`)
- IBM Plex Sans / IBM Plex Mono via Fontsource (bundled at build time)
- Node.js `crypto` (PBKDF2 + AES-256-GCM)
- `postgres` (Supabase session pooler; idempotent `CREATE TABLE IF NOT EXISTS` on connect)
- `vitest` (unit tests for crypto/vault/sync plus renderer contract tests) · `oxlint` + `oxfmt`

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API Keys** → copy the **Project URL** (`https://xxxx.supabase.co`).
3. **Settings → Database → Connection string → Session pooler** → copy the `postgresql://…` URI (set/reset the DB password there if needed).
4. In Passbox: **Cloud sync → Connect** with those two values. Tables are created automatically on first connect.

## Development

```bash
npm install
npm start        # run the app in development mode
npm test         # vitest: unit + renderer contract tests
npm run lint     # oxlint + oxfmt
npm run icons    # regenerate assets/icons from assets/icon.svg
npm run package  # package the app
npm run make     # build installers → out/make/
```

### Application icon

`assets/icon.svg` is the single source of truth. `npm run icons` renders it with `@resvg/resvg-js` into `assets/icons/` (PNG 16–1024, `icon.ico` for Windows, `icon.icns` for macOS) and the generated files are kept in the repository, so packaging never depends on the script being run. Electron Forge picks them up through `packagerConfig.icon` in `forge.config.mjs`, so **packaged builds carry the new icon**; `npm start` still shows Electron's own icon because it runs Electron's development binary.

### Design & feature spec

`odd/tasks/passbox-ui-redesign.md` holds the specs (S1–S15), the task list and the verification log for the UI/UX redesign, including the independent verification results.

## License

MIT
