// =======================================================================
// PhysioRecord — Minimal Hardened Electron Preload Bridge (CommonJS)
// Exposes strictly typed IPC methods on `window.electronAPI` with
// `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
// =======================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('physiorecord:get-app-info'),
  saveFile: (options) => ipcRenderer.invoke('physiorecord:save-file', options),
  pickBackupDirectory: () => ipcRenderer.invoke('physiorecord:pick-backup-dir'),
  getConfiguredBackupDirectory: () => ipcRenderer.invoke('physiorecord:get-backup-dir'),
  clearConfiguredBackupDirectory: () => ipcRenderer.invoke('physiorecord:clear-backup-dir'),
  writeToConfiguredBackupDirectory: (options) =>
    ipcRenderer.invoke('physiorecord:write-backup-dir', options),
  printCurrentPage: (options) => ipcRenderer.invoke('physiorecord:print-page', options),
  exportCurrentPageToPdf: (options) => ipcRenderer.invoke('physiorecord:export-pdf', options),
  openExternalUrl: (options) => ipcRenderer.invoke('physiorecord:open-external', options),
  checkForUpdates: () => ipcRenderer.invoke('physiorecord:check-for-updates'),
  fetchGithubReleases: () => ipcRenderer.invoke('physiorecord:fetch-github-releases'),
  startLanSyncHub: (options) => ipcRenderer.invoke('physiorecord:lan-sync-start', options),
  stopLanSyncHub: () => ipcRenderer.invoke('physiorecord:lan-sync-stop'),
  getLanSyncHubStatus: () => ipcRenderer.invoke('physiorecord:lan-sync-status'),
  lanSyncExchange: (options) => ipcRenderer.invoke('physiorecord:lan-sync-exchange', options),
}));
