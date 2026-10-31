import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVaultStore } from './main/vault-store.js';
import { createDriveConfig } from './main/drive-config.js';
import { createDriveService } from './main/drive-service.js';
import { createDriveClient } from './main/drive-client.js';
import { createDriveFiles } from './main/drive-files.js';

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

ipcMain.handle('vault:create', (_event, masterPassword) =>
  vaultStore.create(masterPassword),
);

ipcMain.handle('vault:unlock', (_event, masterPassword) =>
  vaultStore.unlock(masterPassword),
);

ipcMain.handle('vault:save', (_event, payload) => vaultStore.save(payload));

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

// Vault transport (S8/S3): ciphertext envelopes only cross this bridge.
ipcMain.handle('drive:upload', (_event, envelope) =>
  driveFiles.upload(envelope),
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
