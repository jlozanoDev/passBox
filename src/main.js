import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVaultStore } from './main/vault-store.js';
import { createDriveConfig } from './main/drive-config.js';
import { createDriveService } from './main/drive-service.js';
import { createDriveClient } from './main/drive-client.js';
import { createDriveFiles } from './main/drive-files.js';
import { createSyncService } from './main/sync.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

/** @type {ReturnType<typeof createVaultStore>|null} */
let vaultStore = null;
/** @type {ReturnType<typeof createDriveService>|null} */
let driveService = null;
/** @type {ReturnType<typeof createDriveFiles>|null} */
let driveFiles = null;
/** @type {ReturnType<typeof createSyncService>|null} */
let syncService = null;
/** @type {ReturnType<typeof createDriveConfig>|null} */
let driveConfig = null;

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

// Drive connection surface (S5): BYO credentials + loopback OAuth.
ipcMain.handle('drive:status', () => driveService.status());

ipcMain.handle('drive:set-credentials', (_event, credentials) =>
  driveService.setCredentials(credentials),
);

ipcMain.handle('drive:connect', () => driveService.connect());

ipcMain.handle('drive:disconnect', () => {
  driveService.disconnect();
});

// Sync/conflict surface (S3/T8): last sync outcome + deferred state.
ipcMain.handle('drive:sync-status', () => ({
  drive: driveService.status(),
  lastSync: driveConfig.getLastSync(),
}));

// Vault transport (S8/S3): the envelope comes from the vault file on
// disk in this process — the renderer never supplies upload bytes and
// only ever receives ciphertext envelopes back.
ipcMain.handle('drive:upload', () =>
  driveFiles.upload(vaultStore.readEnvelope()),
);

ipcMain.handle('drive:download', () => driveFiles.download());

app.whenReady().then(() => {
  vaultStore = createVaultStore(app.getPath('userData'));
  driveConfig = createDriveConfig(app.getPath('userData'));
  driveService = createDriveService(driveConfig, vaultStore, (url) =>
    shell.openExternal(url),
  );
  driveFiles = createDriveFiles({
    config: driveConfig,
    createDriveClient: () => createDriveClient(driveConfig, vaultStore),
  });
  syncService = createSyncService({
    vaultStore,
    driveFiles,
    config: driveConfig,
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
