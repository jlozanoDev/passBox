import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVaultStore } from './main/vault-store.js';
import { createS3Config } from './main/s3-config.js';
import { createS3Service } from './main/s3-service.js';
import { createS3Client } from './main/s3-client.js';
import { createS3Files } from './main/s3-files.js';
import { createSyncService } from './main/sync.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

/** @type {ReturnType<typeof createVaultStore>|null} */
let vaultStore = null;
/** @type {ReturnType<typeof createS3Service>|null} */
let s3Service = null;
/** @type {ReturnType<typeof createS3Files>|null} */
let s3Files = null;
/** @type {ReturnType<typeof createSyncService>|null} */
let syncService = null;
/** @type {ReturnType<typeof createS3Config>|null} */
let s3Config = null;

/**
 * Build an S3 client from stored settings plus the decrypted secret
 * (S2): the secret never reaches disk in plaintext and is re-derived
 * from the vault session key per operation.
 */
function createConnectedS3Client() {
  const settings = s3Config.getCredentials();
  const blob = s3Config.getTokenBlob();
  if (!settings || !blob) {
    throw new Error('Cloud sync is not connected');
  }
  const { secretAccessKey } = vaultStore.decryptSessionData(blob);
  return createS3Client({ ...settings, secretAccessKey });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// IPC surface for the vault session (S1/S2): the renderer never touches
// the filesystem or crypto directly — passwords cross this boundary
// only in memory, never to disk or network.
ipcMain.handle('vault:status', () => vaultStore.status());

ipcMain.handle('vault:create', async (_event, masterPassword) => {
  const payload = vaultStore.create(masterPassword);
  // RF-03: an existing cloud vault (reinstall flow) replaces the fresh
  // local one right after creation — same rules as unlock.
  const { payload: fresh } = await syncService.open(payload, masterPassword);
  return fresh;
});

ipcMain.handle('vault:unlock', async (_event, masterPassword) => {
  const payload = vaultStore.unlock(masterPassword);
  // RF-03: check the cloud on open and adopt a newer remote vault.
  const { payload: fresh } = await syncService.open(payload, masterPassword);
  return fresh;
});

ipcMain.handle('vault:save', (_event, payload) => {
  const saved = vaultStore.save(payload);
  // RF-03: automatic upload after every mutation. Fire-and-forget: the
  // local save must neither block on nor be undone by sync failures.
  void syncService.uploadAfterSave(saved);
  return saved;
});

ipcMain.handle('vault:lock', () => {
  vaultStore.lock();
});

// Cloud connection surface (S1/S2/S6): BYO S3 settings, one action —
// validate with HeadBucket, then store the secret encrypted at rest.
ipcMain.handle('cloud:status', () => s3Service.status());

ipcMain.handle('cloud:connect', (_event, settings) =>
  s3Service.connect(settings),
);

ipcMain.handle('cloud:disconnect', () => {
  s3Service.disconnect();
});

// Sync/conflict surface (S3/T8): last sync outcome + deferred state.
ipcMain.handle('cloud:sync-status', () => ({
  cloud: s3Service.status(),
  lastSync: s3Config.getLastSync(),
}));

// Vault transport (S4/S3): the envelope comes from the vault file on
// disk in this process — the renderer never supplies upload bytes and
// only ever receives ciphertext envelopes back.
ipcMain.handle('cloud:upload', () => s3Files.upload(vaultStore.readEnvelope()));

ipcMain.handle('cloud:download', () => s3Files.download());

app.whenReady().then(() => {
  vaultStore = createVaultStore(app.getPath('userData'));
  s3Config = createS3Config(app.getPath('userData'));
  s3Service = createS3Service({
    config: s3Config,
    vaultStore,
    createS3Client,
  });
  s3Files = createS3Files({
    getBucket: () => s3Config.getCredentials()?.bucket ?? null,
    createS3Client: createConnectedS3Client,
  });
  syncService = createSyncService({
    vaultStore,
    vaultFiles: s3Files,
    config: s3Config,
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// RNF-04: overwrite the session key when the app quits.
app.on('before-quit', () => {
  vaultStore?.lock();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
