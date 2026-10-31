# Passbox

Local-first, zero-knowledge secret manager for Windows, macOS and Linux. Stores passwords, API tokens and development secrets in a single AES-256-GCM encrypted vault, synced through your own S3-compatible bucket (`passbox.vault` object) as a blind remote disk. Works with AWS S3, Backblaze B2, Cloudflare R2, MinIO or any S3-compatible endpoint — credentials stay yours (BYO), the secret key is encrypted at rest.

## Stack

- Electron + Vite + Electron Forge
- Vue 3 + Tailwind CSS
- Node.js `crypto` (PBKDF2 + AES-256-GCM)
- `@aws-sdk/client-s3` (S3-compatible object API)

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
