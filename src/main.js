import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVaultStore } from './main/vault-store.js';
import { createClipboardService } from './main/clipboard.js';
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
/**
 * Master password kept only in memory while the vault is unlocked so
 * cloud:connect can bootstrap lineage/import (B3). Cleared on lock/quit.
 * @type {string|null}
 */
let sessionMasterPassword = null;

const createWindow = () => {
  // The packaged exe carries assets/icons/icon.ico; the window icon covers
  // dev runs and Linux, where the window may not inherit the exe icon.
  const appIcon = path.join(app.getAppPath(), 'assets', 'icons', 'icon.png');

  const mainWindow = new BrowserWindow({
    // S14: the shipped default shows the full index (>= 1024px) layout.
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    ...(existsSync(appIcon) ? { icon: appIcon } : {}),
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
  sessionMasterPassword = masterPassword;
  // RF-03: an existing cloud vault (reinstall flow) replaces the fresh
  // local one right after creation — same rules as unlock.
  const { payload: fresh } = await cloudService.open(payload, masterPassword);
  return fresh;
});

ipcMain.handle('vault:unlock', async (_event, masterPassword) => {
  const payload = vaultStore.unlock(masterPassword);
  sessionMasterPassword = masterPassword;
  // RF-03: check the cloud on open and merge newer remote rows.
  const { payload: fresh, action } = await cloudService.open(
    payload,
    masterPassword,
  );
  // A2: persist a pulled merge so the local file matches what we return.
  if (action === 'pulled') {
    vaultStore.save(fresh);
  }
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
  sessionMasterPassword = null;
});

// Cloud connection surface (S1/S2/S6): BYO Supabase settings, one
// action — migrate schema, store the secrets encrypted at rest, then
// bootstrap import/lineage while the vault is still unlocked (B3).
ipcMain.handle('cloud:status', () => cloudService.status());

ipcMain.handle('cloud:connect', (_event, settings) =>
  cloudService.connect(settings, {
    masterPassword: sessionMasterPassword,
  }),
);

ipcMain.handle('cloud:disconnect', () => {
  cloudService.disconnect();
});

// Clipboard surface (S10): secrets are copied here so the renderer never
// needs an insecure-origin clipboard permission. The fingerprint/clear
// policy lives in ./main/clipboard.js so it stays unit-testable.
const clipboardService = createClipboardService({ clipboard });

ipcMain.handle('clipboard:copy', (_event, text, options = {}) =>
  clipboardService.copy(text, options),
);

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
  sessionMasterPassword = null;
  clipboardService.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
