# Passbox

Local-first, zero-knowledge secret manager for Windows, macOS and Linux. Stores passwords, API tokens and development secrets in an AES-256-GCM encrypted local vault and syncs them as **client-encrypted rows** in your own Supabase Postgres database. Connects with your **project URL + session-pooler connection string** (both stay yours — BYO); the connection string is stored encrypted at rest and secret values never leave the device as plaintext. Two devices with the same master password share one salt and can read each other's rows.

## Stack

- Electron + Vite + Electron Forge
- Vue 3 + Tailwind CSS
- Node.js `crypto` (PBKDF2 + AES-256-GCM)
- `postgres` (Supabase session pooler; idempotent `CREATE TABLE IF NOT EXISTS` on connect)

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API Keys** → copy the **Project URL** (`https://xxxx.supabase.co`).
3. **Settings → Database → Connection string → Session pooler** → copy the `postgresql://…` URI (set/reset the DB password there if needed).
4. In Passbox: **Cloud sync → Connect** with those two values. Tables are created automatically on first connect.

## Development

```bash
npm install
npm start        # run the app in development mode
npm run lint     # oxlint + oxfmt
npm run package  # package the app
npm run make     # build installers
```

## License

MIT
