# Passbox

Local-first, zero-knowledge secret manager for Windows, macOS and Linux. Stores passwords, API tokens and development secrets in an AES-256-GCM encrypted local vault and syncs them as **client-encrypted rows** in your own Supabase Postgres database. Credentials stay yours (BYO): project URL, service key and connection string are stored encrypted at rest; secret values never leave the device as plaintext. Two devices with the same master password share one salt and can read each other's rows.

## Stack

- Electron + Vite + Electron Forge
- Vue 3 + Tailwind CSS
- Node.js `crypto` (PBKDF2 + AES-256-GCM)
- `postgres` (Supabase session pooler; idempotent `CREATE TABLE IF NOT EXISTS` on connect)

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
