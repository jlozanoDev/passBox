import { contextBridge, ipcRenderer } from 'electron';

// Minimal, typed-by-contract bridge: the renderer can only talk to the
// vault session through these invoke channels (S1: the master password
// goes to the main process in memory and is never persisted here).
contextBridge.exposeInMainWorld('passbox', {
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  vaultCreate: (masterPassword) =>
    ipcRenderer.invoke('vault:create', masterPassword),
  vaultUnlock: (masterPassword) =>
    ipcRenderer.invoke('vault:unlock', masterPassword),
  vaultSave: (payload) => ipcRenderer.invoke('vault:save', payload),
  vaultLock: () => ipcRenderer.invoke('vault:lock'),
  driveStatus: () => ipcRenderer.invoke('drive:status'),
  driveSetCredentials: (credentials) =>
    ipcRenderer.invoke('drive:set-credentials', credentials),
  driveConnect: () => ipcRenderer.invoke('drive:connect'),
  driveDisconnect: () => ipcRenderer.invoke('drive:disconnect'),
  driveUpload: (envelope) => ipcRenderer.invoke('drive:upload', envelope),
  driveDownload: () => ipcRenderer.invoke('drive:download'),
});
