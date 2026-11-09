# Passbox UI/UX Redesign

Objective: premium, minimalist, professional password-manager experience (Linear/Raycast/1Password direction) implemented on the existing Electron + Vue 3 + Tailwind app, preserving backend, IPC contract and encryption.
Branch: `feature/passbox-core` (work units committed here). Delivery strategy: `single-pr` (UI-only feature). Test runner: `vitest run`.

## Specs

**S1 — App shell & navigation.** Persistent sidebar with Vault, Generator, Security, Settings; page header with title/subtitle and contextual actions; search reachable from every view. Sidebar collapses to an icon rail at <1024px and to a full-width bottom navigation at <640px. Every view reachable on every breakpoint. Active view is visually distinct.

**S2 — Design system.** Tokens for color, typography, spacing, radius, shadow and motion defined once (light + dark). Dark mode is class-based, follows `prefers-color-scheme` by default, and a manual choice (light/dark/system) persists across restarts in `localStorage` under `passbox.theme`. Components consume tokens only; no hardcoded hex in templates.

**S3 — Unlock / create screen.** Premium branded unlock experience. Master password input masked by default with an explicit reveal toggle. Create mode adds confirmation. Existing validation strings preserved verbatim: `Master password must be at least 8 characters.`, `Passwords do not match.`, `Enter your master password.`, `Wrong master password.` Busy state disables submission and shows progress. Autofocus on the master password field.

**S4 — Vault list.** Search matches title, username and category (existing semantics preserved, case-insensitive, trimmed). Category filter chips plus All/Favorites. Favorites render in a pinned section. List rows show title, username, category and relative update time. Empty state for an empty vault and a distinct empty state for "no matches". Rows are keyboard reachable and the selected row is visible.

**S5 — Credential detail.** Selecting a credential opens a detail panel showing title, username, masked secret, category, timestamps and notes. Secret is masked by default; reveal is explicit and per-selection. Copy username and copy password actions exist and give visible feedback. Favorite toggle, edit and delete actions exist. Delete asks for confirmation and names the credential. On mobile the detail panel replaces the list with a back affordance.

**S6 — Create / edit dialog.** Persists the existing fields unchanged: `title`, `username`, `secret`, `category`, `notes`; adds optional `favorite`. Title is required. Category options stay `password`, `api_token`, `database`, `note`, `other`. Escape and backdrop close without saving. Secret field can generate a password inline. Focus returns to the trigger context on close (dialog keeps focus inside).

**S7 — Password generator.** Real generation via `crypto.getRandomValues` with rejection sampling (no modulo bias) in `src/renderer/lib/password-generator.js`. Configurable length 8–64 and uppercase/lowercase/digits/symbols toggles; at least one class always enabled; at least one character from every enabled class; no guaranteed predictability beyond that. Strength indicator uses the real heuristic in S8. Copy action with feedback. Regenerating on option change is allowed.

**S8 — Security center.** Real, local computation only, in `src/renderer/lib/security-audit.js`: totals, favorites, weak passwords (documented heuristic: entropy estimate, short passwords and a small common-password list), reused passwords (identical secret in 2+ items), stale (older than 180 days). The audit returns identifiers and counts only — never secret text. UI labels the assessment as an estimate, never claims a password is secure, and never renders secret values. Rows link back to the credential in the vault. Empty state when the vault is empty.

**S9 — Settings.** Appearance control (light/dark/system) wired to S2. Cloud sync keeps the existing behaviour and wording of `cloudStatus`, `cloudConnect`, `cloudDisconnect` and `cloudSyncStatus`, including the "encrypted with your vault key before storage" explanation. Vault section shows item count and lock action. No new network calls.

**S10 — Feedback & secret safety.** Toasts for copy, save, delete and lock. Toasts never contain secret values. Passwords are never rendered unmasked by default, never written to `localStorage`, never logged, and never placed in the window title. Password inputs use `autocomplete="off"`. Sensitive clipboard copies request a 30s best-effort auto-clear that only clears if the clipboard still holds that value.

**S11 — Accessibility & responsiveness.** Semantic landmarks (`nav`, `main`, `header`), labelled controls, `aria-pressed` for toggles, visible `focus-visible` rings, 44px minimum touch targets on mobile, no horizontal scrolling at 360px width, and `prefers-reduced-motion` disables non-essential motion.

**S12 — Verification.** `npm test` stays green (77 baseline tests plus new lib tests). New pure modules have tests. `npx oxfmt --check` passes for every changed file. Renderer builds and loads with no console errors. Existing IPC channels and behaviours are unchanged; the only additive channel is `clipboard:copy`.

**S13 — Spanish UI (supersedes every English literal quoted in S1–S11).** All user-visible copy in the renderer is neutral, professional Spanish: navigation, headings, labels, placeholders, helpers, empty states, confirmations, toasts, aria-labels, relative dates, strength labels and validation messages. `<html lang="es">`. The validation messages replace the legacy English strings: `La contraseña maestra debe tener al menos 8 caracteres.`, `Las contraseñas no coinciden.`, `Introduce tu contraseña maestra.`, `Contraseña maestra incorrecta.` Brand name, values stored in the vault and internal identifiers remain unchanged. Code comments and identifiers stay English.

**S14 — Art direction & visual identity (anti-generic).** One coherent direction — *Swiss editorial × precision instrument* — executed everywhere; no style mixing. Concretely:

- **Colour**: monochrome system only. Light = warm paper/ink; dark = warm charcoal (never blue-black). Exactly one functional accent, petrol teal, used **only** for interactive/selected/focus/brand states. Semantic `ok`/`warn`/`danger` unchanged. Forbidden: violet/indigo/cyan accents, gradients, glassmorphism, decorative blobs, shadows on every component.
- **Typography**: IBM Plex Sans (UI) + IBM Plex Mono (all data: secrets, usernames, timestamps, counts, keyboard hints), bundled locally through Fontsource so no runtime network is needed. Deliberate contrast: 10px uppercase micro-labels with ≥0.12em tracking; view titles 17–18px semibold at −0.02em; body 12.5–13px; `tabular-nums` on every numeric readout.
- **Composition**: open layout. Sections are separated by hairline rules, not boxed in cards; cards are reserved for the dialog, toasts, confirm and genuinely grouped tools (generator panel). No card-inside-card, no identical card grids, no three-column repetition.
- **Navigation**: ≥1024px full typographic index sidebar (labels + hairlines + accent active bar, no pill fills); 640–1023px icon rail ≤64px with labels hidden and accessible names kept; <640px bottom navigation. Default window ≥1120px wide so the shipped default is the full index.
- **Detail = dossier**: single column, hairline-separated label/value rows, the secret row is the visual anchor (mono, rule above and below), metadata as a tabular footer.
- **Microdetail**: 44px minimum touch targets on mobile (S11), `tabular-nums`, 120–160ms colour-only transitions, `focus-visible` = 2px accent ring at 2px offset, elevation only on the dialog.
- **Brand mark**: an original two-bracket "shutter" glyph (two interlocking L brackets around a void) — no key/lock cliché, no emoji — rendered by `src/renderer/components/ui/BrandMark.vue`.
- **Application icon**: authored as `assets/icon.svg` and rasterized by `scripts/build-icons.mjs` (`@resvg/resvg-js`) into `assets/icons/icon.png` (512), `icon.ico` (16/32/48/64/128/256) and `icon.icns` (16–512); wired into `packagerConfig.icon` in `forge.config.mjs` and the favicon in `index.html`. The script is reproducible; generated files are kept next to the source.
- **Honesty**: the packaged exe carries the new icon; the *dev* `npm start` binary keeps Electron's own icon (patching `electron.exe` is out of scope and documented as a limitation).

**S15 — Contract tests for the security-sensitive UI.** The probes an independent verifier derived are adopted as real tests: `src/main/clipboard-copy.test.js` (channel set unchanged + SHA-256 fingerprint retention + conditional clear + `before-quit` cleanup + timer replacement + rejection of empty/non-string input) and `src/renderer/ui-contract.test.js` (Spanish literals, no `console.*` in the renderer, `localStorage` limited to `passbox.theme`, masked-by-default inputs, `autocomplete="off"`, rail/bottom-nav breakpoints, 44px mobile classes, dialog focus return). They must be GREEN with the feature and RED if the contract breaks.

## Tasks

| ID | Task | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| T1 | Design tokens, base styles, component classes (light + dark) | S2 | inline | done | `src/renderer/index.css`; themes toggled in browser (light/dark/system) |
| T2 | Icon set + UI primitives (icon, toast, confirm, strength meter) | S2, S10 | inline | done | `src/renderer/lib/icons.js`, `src/renderer/components/ui/*`; toast + confirm observed in browser |
| T3 | Pure logic: password generator + security audit + tests | S7, S8 | inline | done | RED first, then GREEN: `npx vitest run src/renderer/lib` → 18 passed |
| T4 | Unlock/create screen | S3 | inline | done | Browser: unlock + create mode, all 4 validation strings rendered |
| T5 | App shell, navigation, view switching, keyboard shortcuts | S1, S11 | inline | done | Sidebar/bottom-nav switch observed at 1280 / 900 / 400 px |
| T6 | Vault list with search, filters, favorites, empty states | S4 | inline | done | Browser: search hit/miss, chips, favorites section, keyboard-reachable rows |
| T7 | Credential detail panel with mask/copy/favorite/delete | S5, S10 | inline | done | Browser: masked secret, reveal, copy toast, delete confirm dialog |
| T8 | Create/edit dialog with inline generator | S6 | inline | done | Browser: dialog, required-title error, `aria-invalid`, focus return |
| T9 | Generator view | S7 | inline | done | Browser: 28-char password generated, class toggles, strength meter |
| T10 | Security view | S8 | inline | done | Browser: weak/reused/stale rows match demo data; empty-secret audit fix in L6 |
| T11 | Settings view + restyled cloud sync | S9 | inline | done | Browser: appearance control, vault stats, cloud form/status in Spanish |
| T12 | Clipboard IPC (additive) with sensitive auto-clear | S10 | inline | done | `src/main.js` + `src/preload.js`; fingerprint-only retention, timer cleared on quit; independent verifier assigned (Risk item 2) |
| T13 | Polish, responsive + visual verification, docs | S11, S12 | inline | done | Recheck measured: rail 64px @760, full index 236px @1120, bottom nav <640, **0** controls <44px @320/360/400 (incl. the detail header `min-w-11` fix), no h-scroll, 0 console errors |
| T14 | Translate all user-facing copy to neutral Spanish + `lang="es"` | S13 | inline | done | Verifier S13 PASS: `lang="es"` measured, 0 English leftovers in rendered UI |
| T15 | Art direction pass: palette, IBM Plex typography, radius/shadow/motion tokens | S14 | inline | done | `index.css` reworked (bone/ink + petrol teal, Plex via Fontsource, 44px mobile density, hairline `pb-rule`); `npm run icons`-independent token check in `ui-contract.test.js` |
| T16 | Composition pass: index rail, masthead, dossier detail, rule-separated sections | S1, S14 | inline | done | Browser at 1120/760/400 px: rail 64px + labels hidden below lg, bottom nav `sm:hidden`, dossier rows, Settings/Security open sections (`main .card` count = 0) |
| T17 | Brand mark + original app icon pipeline (SVG → png/ico/icns, forge + favicon) | S14 | inline | done | `assets/icon.svg` + `scripts/build-icons.mjs` (`npm run icons`) → 8 PNGs, `icon.ico`, `icon.icns`; wired to `packagerConfig.icon` + favicon + `BrowserWindow` icon |
| T18 | Adopt verifier contract tests; fix B2 (44px), B3 (dialog focus return), A1, A2 | S6, S10, S11, S15 | inline | done | `clipboard-copy.test.js` (9) + `ui-contract.test.js` (21); measured 0 controls <44px at 320/360/400; `returnFocus` restore in SecretModal + ConfirmDialog; fallback auto-clear; `'Sin título'` |

## Log

### L1 — User request (verbatim, 2026-11-09)

> Lee y aplica la skill @password-manager-ui-ux.
>
> Quiero que analices toda mi aplicación de gestión de claves y realices un rediseño UI/UX completo.
>
> Primero audita el proyecto, identifica sus problemas visuales y de usabilidad y después implementa el rediseño directamente sobre el código existente.
>
> Quiero un resultado premium, moderno, minimalista y profesional, inspirado en Linear, Raycast y 1Password.
>
> No elimines funcionalidades existentes ni sustituyas funcionalidades reales por mockups.
>
> Prioriza la calidad visual, la experiencia de usuario, la seguridad y la consistencia de todo el producto.
>
> No te limites a proponer cambios: implementa el rediseño y verifica que funciona.

Skill `password-manager-ui-ux` supplied inline by the user (audit → UX strategy → design system → redesign → polish → validation).

### L2 — Audit evidence

- Stack: Electron 45, Vue 3, Tailwind v4 (`@import 'tailwindcss'` only — no tokens), no router, no icon library, no state library.
- `App.vue` holds all state; single column `max-w-2xl`; credentials only editable through a modal; no detail view, copy, favorites, filters, generator, security insight, dark mode or delete confirmation.
- Row actions use `opacity-0 group-hover` — unusable on touch.
- `vault-store.save` requires payload `salt` to match the session salt; persisted items are whole-JSON encrypted rows, so additive item fields (`favorite`) are backwards compatible.
- Baseline: `npm test` 77/77 green; `npm run lint` red on 23 already-unformatted files (pre-existing, not a regression). Renderer build config: `vite.renderer.config.mjs`.

### L3 — Route decision

Large task (many screens, shared design system, verification across breakpoints). All tasks run inline: every work unit touches the shared token layer and shell conventions, so they are dependent, and the Writer trigger's independence precondition does not hold. Feature document and mirror created before the first source write.

### L4 — Verification log

- T3 RED observed first: `password-generator.test.js` and `security-audit.test.js` fail before the modules exist; GREEN after implementation.
- `npx vitest run src/renderer/lib` → 18 tests pass (2 files).
- `npm test` → **95 tests pass** (77 baseline + 18 new), 9 files.
- `npx oxfmt --check` on all 28 changed files → `All matched files use the correct format` (15 files were rewritten by `npx oxfmt` first; that is the source-mutating normalization step).
- `npx vite build --config vite.renderer.config.mjs` → build succeeds (38.33 kB CSS / 134.46 kB JS).
- Browser verification against a stubbed `window.passbox` bridge (temporary `preview-mock.html` harness, dev server): unlock screen, create mode, vault list, detail panel, create/edit dialog, generator, security center, settings, cloud sync form, light and dark themes, and the four validation strings — **zero console errors** on every view.
- Responsive probes inside a sized iframe (media queries respond to the frame viewport): 400 px → sidebar hidden, bottom navigation visible, list full width, selecting a row replaces the list with a back affordance; 900 px → sidebar visible, bottom navigation hidden; 1280 px → master/detail side by side (382 px list + detail). `scrollWidth === clientWidth` at all three widths (no horizontal scrolling).
- Pre-existing `npm run lint` failure remains out of scope (23 unrelated unformatted files at baseline).

### L5 — User request (verbatim, 2026-11-09)

> traduce toda la aplicación al español

Scope read: user-visible copy only (S13). Stored values, item fields, brand, code identifiers and comments are untouched. S3's quoted validation strings are superseded by their Spanish equivalents.

### L6 — Defects found and fixed during verification (2026-11-09)

- **Audit counted secretless notes as weak**: `auditVault` scored every item, so a `note` with an empty secret was reported under "Secretos débiles" and dragged the average down. Fix: strength scoring (and the new `assessed` count) only covers items that store a secret; `averageScore` divides by `assessed`. Test-first: RED (2 failing) → GREEN (12 passing) in `security-audit.test.js`. `SecurityView` now reads "Fuerza media de N secretos guardados" and skips the meter when `assessed === 0`.
- **Search header label**: while a query was active the list header still said "Todas las credenciales". Now `Resultados de búsqueda`.
- **Pre-existing save toast**: the edit toast always reported "saved" because `editingItem` was cleared before the message was computed (`isEditing` captured first).

### L7 — Independent verification (2026-11-09, read-only agent, scratch copy)

S2, S3, S4, S5, S7, S8, S9, S10, S12, S13 **PASS**; S1, S6, S11 **FAIL**. Baseline confirmed at 77 tests / HEAD `3333ffb`; candidate 95 tests; IPC strictly additive (9 → 10 channels, none removed); `src/crypto` and `src/main/*` untouched; clipboard probe 26/26 assertions; 0 console errors; no horizontal scroll at 360px; 0 English strings in the rendered UI.

Blockers:
- **B1 (S1)** — no icon rail: `SidebarNav.vue` aside is `hidden w-[236px] … md:flex`, still 236px with labels at 900px; bottom nav uses `md:hidden` instead of `<640px`.
- **B2 (S11)** — 27 controls below 44px at a real 360px viewport (`size-9`=36px row/header actions, `.chip` 28px, `.btn` 34px, `.field` 38px).
- **B3 (S6)** — dialog does not restore focus to the trigger: measured `activeElement=BODY` after Escape.
- **B4** — the verifier's own stray probe file `src/main-under-test.mjs` (removed by the parent; not part of the deliverable).

Advisories adopted: **A1** renderer clipboard fallback drops `sensitive` so no auto-clear; **A2** English `'Untitled'` fallback in `SecurityView.vue`; **A4** `src/renderer/lib/clipboard.js` untested; **A5** doc claimed 99 tests (corrected to 95).

### L8 — User directive (verbatim, 2026-11-09)

> No quiero una interfaz bonita que parezca una plantilla. Quiero un producto con identidad propia, decisiones visuales intencionadas y una ejecución que parezca diseñada por un equipo de producto de primer nivel. Además, cambia el icono de la aplicación que está el de por defecto.

Skill `anti-ai-design` supplied inline. Decisions taken (spec'd as S14 before any code): direction *Swiss editorial × precision instrument*; monochrome warm paper/ink + warm charcoal with a single petrol-teal functional accent (the indigo `#5b5bd6` accent is exactly the AI-SaaS signature the skill forbids); IBM Plex Sans + IBM Plex Mono bundled locally (type as identity, mono carries all data); open composition with hairline rules instead of card grids; typographic index sidebar → icon rail → bottom nav; dossier detail; original "shutter" brand mark and a reproducible icon pipeline replacing the default Electron icon. Added dev deps: `@fontsource-variable/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@resvg/resvg-js`.

### L9 — Correction batch + art direction (2026-11-09)

- **B1 (S1 rail)** — `SidebarNav.vue` is now `hidden w-16 … sm:flex lg:w-[236px]`: 64px icon rail from 640px, labels `hidden lg:inline`, active item marked by a 2px accent bar, native tooltips, lock icon-only; bottom navigation moved to `sm:hidden`. Measured: 64px at 760px, 236px with labels at 1120px, bottom nav at 400px.
- **B2 (S11 44px)** — `.btn/.btn-sm/.btn-lg/.row-action/.chip/.btn-icon` and `.field` are 44px by default and tighten from `sm`; the length slider got a `.range` class with a 44px hit area; template overrides (`size-9`, `h-6`, `max-sm:size-9`) removed. Measured: **0** interactive elements below 44px at 320px and 400px.
- **B3 (S6 focus)** — `SecretModal` and `ConfirmDialog` capture the trigger on open (`returnFocus`) and restore it on close (`target.focus()` when still connected); `ConfirmDialog` also gained a Tab trap.
- **A1** — the renderer's Web Clipboard fallback now schedules the same 30s conditional clear (read-back compare, unconditional best-effort when unreadable), so the toast never over-promises.
- **A2** — `'Untitled'` → `'Sin título'`.
- **Clipboard extraction** — the fingerprint/clear policy moved from `src/main.js` into `src/main/clipboard.js` so it is unit-testable without an Electron display; `main.js` only wires `ipcMain.handle('clipboard:copy', …)` and calls `clipboardService.flush()` on `before-quit`. Channel set unchanged (10 total).
- **Art direction** — `index.css` rewritten (bone `#f1efea`/ink `#17161a` light, warm charcoal `#121211` dark, accent `#0f6b66`/`#56b8ae`), IBM Plex Sans Variable + IBM Plex Mono imported from Fontsource in `renderer/main.js`, ink primary buttons, uppercase 10px micro-labels, `tabular-nums` on readouts, radii 6/8/10px, elevation only on dialogs.
- **Composition** — masthead header (h-16, `pb-title`), dossier detail with hairline-separated label/value rows and a full-bleed secret row, Settings/Security/Cloud converted from card stacks to rule-separated open sections (`main .card` = 0), Generator keeps one tool card against an open options column with a left rule.
- **Identity** — `BrandMark.vue` (two interlocking brackets + teal core) replaces the key glyph in the sidebar, mobile header, unlock screen and loading screen; `assets/icon.svg` → `scripts/build-icons.mjs` generates `assets/icons/*.png`, `icon.ico`, `icon.icns`; `forge.config.mjs` sets `packagerConfig.icon`, `index.html` links the SVG favicon, `BrowserWindow` gets `icon` when the file exists; default window raised to 1120×760 (min 760×560) so the shipped default is the full index. Dev `npm start` still shows Electron's own exe icon — documented limitation (S14).
- **Anti-AI check** — no violet/indigo, no gradients (contract test), no card grids, no key/lock brand glyph, single accent, no `console.*` in the renderer.

### L10 — Independent recheck + second correction batch (2026-11-09)

Recheck verdict (read-only agent, fresh scratch copy): **B1 RESOLVED** (measured 64px rail @760, 236px + labels @1120, bottom nav <640), **B3 RESOLVED** (Escape/backdrop restore focus to the trigger at 320/360/400/760/1120 and never save), **S14 met** (icon pipeline reproduces `icon.ico`/`icon.icns` byte-identical, fonts bundled, 0 gradients/violet, `main .card` = 0 except the generator tool), **S15 met** (RED proven for both the bottom-nav and clipboard-fingerprint contracts), **S10/S12 met** (10 IPC channels, `git hash-object` of crypto files == HEAD, 122 tests green). **B2 residual (NB-1)**: the two icon-only buttons in the detail header rendered 38×44 / 39×44 below `sm` because `.btn` fixes height but not width when the label collapses.

Second correction batch:
- **NB-1** — `min-w-11` on both detail-header buttons; adopted the verifier's icon-only-width contract test. Re-measured at a real 360px viewport with the detail open: **0** controls <44×44, no horizontal scroll.
- **A1** — `tabular-nums` on the vault list count and the generator min/max labels, plus a contract test over App/Generator/Detail/Security.
- **A2** — added the `before-quit → clipboardService.flush()` wiring test; the plaintext-capture assertion stays as documentation while the conditional-clear test is the real enforcement.
- **A3** — documented the renderer fallback's 30s plaintext closure (preview-only path; the renderer already holds decrypted secrets in memory, and the packaged app always takes the bridge).
- **A4** — removed `backdrop-blur` from both modal scrims (S14 forbids glassmorphism); the scrim is now a flat `bg-black/50`.
- **A5** — `npx oxlint src scripts` clean (removed an unused constant, replaced a regex with `startsWith`).

Suite after the batch: **11 files / 125 tests**, `oxfmt --check` clean, renderer build green, `oxlint` 0 warnings.
