import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVaultStore } from './main/vault-store.js';
import { createSupabaseConfig } from './main/supabase-config.js';
import { createSupabaseCloud } from './main/supabase-cloud.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

/** @type {ReturnType<typeof createVaultStore>|null} */
let vaultStore = null;
/** @type {ReturnType<typeof createSupabaseCloud>|null} */
let cloudService = null;
/** @type {ReturnType<typeof createSupabaseConfig>|null} */
let cloudConfig = null;

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
  const { payload: fresh } = await cloudService.open(payload, masterPassword);
  return fresh;
});

ipcMain.handle('vault:unlock', async (_event, masterPassword) => {
  const payload = vaultStore.unlock(masterPassword);
  // RF-03: check the cloud on open and merge newer remote rows.
  const { payload: fresh } = await cloudService.open(payload, masterPassword);
  return fresh;
});

ipcMain.handle('vault:save', (_event, payload) => {
  const saved = vaultStore.save(payload);
  // RF-03: automatic upload after every mutation. Fire-and-forget: the
  // local save must neither block on nor be undone by sync failures.
  void cloudService.uploadAfterSave(saved);
  return saved;
});

ipcMain.handle('vault:lock', () => {
  vaultStore.lock();
});

// Cloud connection surface (S1/S2/S6): BYO Supabase settings, one
// action — migrate schema, then store the secrets encrypted at rest.
ipcMain.handle('cloud:status', () => cloudService.status());

ipcMain.handle('cloud:connect', (_event, settings) =>
  cloudService.connect(settings),
);

ipcMain.handle('cloud:disconnect', () => {
  cloudService.disconnect();
});

// Sync/conflict surface: last sync outcome + diagnostics.
ipcMain.handle('cloud:sync-status', () => ({
  cloud: cloudService.status(),
  lastSync: cloudConfig.getLastSync(),
}));

app.whenReady().then(() => {
  vaultStore = createVaultStore(app.getPath('userData'));
  cloudConfig = createSupabaseConfig(app.getPath('userData'));
  cloudService = createSupabaseCloud({
    config: cloudConfig,
    vaultStore,
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
