// =======================================================================
// PhysioRecord — Hardened Electron Main Process (Desktop Shell)
// - Locked identity: appId = org.physiorecord.app, productName = PhysioRecord
// - Locked origin: custom privileged scheme `app://bundle` -> `%APPDATA%\PhysioRecord`
// - Zero renderer network access: strict `connect-src 'none'` CSP
// - Atomic file writes (.tmp + rename) for .ptbackup & configured backup directories
// - Modular IPC handlers: githubReleases, lanSyncServer, googleOAuth, osBiometrics
// =======================================================================

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
} from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESKTOP_CSP,
  MAX_FILE_EXPORT_BYTES,
  MIME_BY_EXT,
  createTrustedIpcSenderGuard,
  isAllowedExternalUrl,
  readDesktopConfig,
  writeDesktopConfig,
  writeTextFileAtomically,
} from './security.mjs';
import { registerGitHubReleaseHandlers } from './githubReleases.mjs';
import { registerLanSyncHandlers } from './lanSyncServer.mjs';
import { registerGoogleDriveHandlers } from './googleOAuth.mjs';
import { registerOsBiometricHandlers } from './osBiometrics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Lock Application Name & AppUserModelId BEFORE ready so IndexedDB path never shifts
app.setName('PhysioRecord');
if (process.platform === 'win32') {
  app.setAppUserModelId('org.physiorecord.app');
}

// 2. Register `app://bundle` as a standard, secure, privileged scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// 3. Enforce Single-Instance Lock to protect IndexedDB LevelDB from concurrent access
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
const getMainWindow = () => mainWindow;
const assertTrustedIpcSender = createTrustedIpcSenderGuard(getMainWindow);

function registerAppProtocol() {
  const distDir = path.resolve(__dirname, '..', 'dist');

  protocol.handle('app', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let reqPath = decodeURIComponent(parsedUrl.pathname || '/');
      if (reqPath.includes('\0')) {
        return new Response('Forbidden', { status: 403 });
      }
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      const normalizedRel = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let candidatePath = path.resolve(distDir, normalizedRel.replace(/^[/\\]+/, ''));

      // Ensure resolved path stays strictly inside distDir with explicit separator boundary
      if (candidatePath !== distDir && !candidatePath.startsWith(distDir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fsSync.existsSync(candidatePath) || fsSync.statSync(candidatePath).isDirectory()) {
        candidatePath = path.join(distDir, 'index.html');
      }

      const data = await fs.readFile(candidatePath);
      const ext = path.extname(candidatePath).toLowerCase();
      const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Security-Policy': DESKTOP_CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function registerCoreDesktopHandlers() {
  ipcMain.handle('physiorecord:get-app-info', async (event) => {
    assertTrustedIpcSender(event);
    return {
      version: app.getVersion(),
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      appId: 'org.physiorecord.app',
    };
  });

  ipcMain.handle('physiorecord:save-file', async (event, payload) => {
    assertTrustedIpcSender(event);
    const filename = path.basename(String(payload?.filename || 'PhysioRecord_Export.ptbackup'));
    const content = String(payload?.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_EXPORT_BYTES) {
      throw new Error('File export exceeds 100MB safety limit.');
    }
    const ext = path.extname(filename).replace(/^\./, '') || 'ptbackup';
    const description = String(payload?.description || 'PhysioRecord File');

    const activeWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const dialogOpts = {
      title: description,
      defaultPath: filename,
      filters: [
        { name: description, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const result = activeWin
      ? await dialog.showSaveDialog(activeWin, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);

    if (result.canceled || !result.filePath) {
      return { saved: false, cancelled: true };
    }

    await writeTextFileAtomically(result.filePath, content);
    return {
      saved: true,
      cancelled: false,
      filePath: result.filePath,
      filename: path.basename(result.filePath),
    };
  });

  ipcMain.handle('physiorecord:pick-backup-dir', async (event) => {
    assertTrustedIpcSender(event);
    const activeWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const openOpts = {
      title: 'Select Automatic Encrypted Backup Folder (.ptbackup)',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = activeWin
      ? await dialog.showOpenDialog(activeWin, openOpts)
      : await dialog.showOpenDialog(openOpts);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { configured: false, cancelled: true };
    }

    const folderPath = result.filePaths[0];
    const folderName = path.basename(folderPath) || folderPath;
    const cfg = await readDesktopConfig();
    cfg.backupDirectory = folderPath;
    await writeDesktopConfig(cfg);

    return {
      configured: true,
      folderPath,
      folderName,
      cancelled: false,
    };
  });

  ipcMain.handle('physiorecord:get-backup-dir', async (event) => {
    assertTrustedIpcSender(event);
    const cfg = await readDesktopConfig();
    if (cfg.backupDirectory && fsSync.existsSync(cfg.backupDirectory)) {
      return {
        configured: true,
        folderPath: cfg.backupDirectory,
        folderName: path.basename(cfg.backupDirectory) || cfg.backupDirectory,
      };
    }
    return { configured: false };
  });

  ipcMain.handle('physiorecord:clear-backup-dir', async (event) => {
    assertTrustedIpcSender(event);
    const cfg = await readDesktopConfig();
    delete cfg.backupDirectory;
    await writeDesktopConfig(cfg);
  });

  ipcMain.handle('physiorecord:write-backup-dir', async (event, payload) => {
    assertTrustedIpcSender(event);
    const cfg = await readDesktopConfig();
    const folderPath = cfg.backupDirectory;
    if (!folderPath || !fsSync.existsSync(folderPath)) {
      return { written: false };
    }

    const rawName = String(payload?.filename || 'PhysioRecord_Backup.ptbackup').trim();
    const safeFilename = path.basename(rawName).replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, '');
    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
      throw new Error('Invalid backup filename.');
    }
    const content = String(payload?.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_EXPORT_BYTES) {
      throw new Error('Backup payload exceeds 100MB safety limit.');
    }

    const resolvedFolder = path.resolve(folderPath);
    const targetPath = path.resolve(resolvedFolder, safeFilename);
    if (!targetPath.startsWith(resolvedFolder + path.sep)) {
      throw new Error('Blocked backup path outside configured directory.');
    }
    await writeTextFileAtomically(targetPath, content);

    return {
      written: true,
      folderName: path.basename(resolvedFolder) || resolvedFolder,
      filePath: targetPath,
    };
  });

  ipcMain.handle('physiorecord:print-page', async (event, payload) => {
    assertTrustedIpcSender(event);
    if (!mainWindow) return { printed: false };
    const jobName = String(payload?.jobName || 'PhysioRecord_Document');
    return new Promise((resolve) => {
      mainWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          deviceName: '',
        },
        (success) => {
          resolve({ printed: Boolean(success), jobName });
        }
      );
    });
  });

  ipcMain.handle('physiorecord:export-pdf', async (event, payload) => {
    assertTrustedIpcSender(event);
    if (!mainWindow) return { saved: false };
    const suggestedName = path.basename(String(payload?.suggestedName || 'PhysioRecord_Document.pdf'));

    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Clinical Document as PDF',
      defaultPath: suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });

    if (saveRes.canceled || !saveRes.filePath) {
      return { saved: false, cancelled: true };
    }

    const pdfBuffer = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
    });

    const tmpPath = `${saveRes.filePath}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, pdfBuffer);
    await fs.rename(tmpPath, saveRes.filePath);

    return {
      saved: true,
      cancelled: false,
      filePath: saveRes.filePath,
    };
  });

  ipcMain.handle('physiorecord:open-external', async (event, payload) => {
    assertTrustedIpcSender(event);
    const url = String(payload?.url || '');
    if (!isAllowedExternalUrl(url)) {
      return { opened: false };
    }
    await shell.openExternal(url);
    return { opened: true };
  });

  ipcMain.handle('physiorecord:set-titlebar-theme', (event, opts) => {
    assertTrustedIpcSender(event);
    const isDark = Boolean(opts && typeof opts === 'object' && opts.isDark);
    if (mainWindow && typeof mainWindow.setTitleBarOverlay === 'function') {
      try {
        mainWindow.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: isDark ? '#e2e8f0' : '#334155',
          height: 32,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  });
}

function registerIpcHandlers() {
  registerCoreDesktopHandlers();
  registerGitHubReleaseHandlers({ ipcMain, assertTrustedIpcSender });
  const { closeLanSyncServer } = registerLanSyncHandlers({ ipcMain, assertTrustedIpcSender });
  const { closeOAuthServer } = registerGoogleDriveHandlers({
    ipcMain,
    assertTrustedIpcSender,
    getMainWindow,
  });
  registerOsBiometricHandlers({ ipcMain, assertTrustedIpcSender });

  app.on('before-quit', () => {
    closeLanSyncServer();
    closeOAuthServer();
  });
}

function createMainWindow() {
  const windowIconPath = path.join(
    __dirname,
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 360,
    minHeight: 640,
    title: 'PhysioRecord',
    ...(fsSync.existsSync(windowIconPath) ? { icon: windowIconPath } : {}),
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(!isMac
      ? {
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#334155',
            height: 32,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // Block any unexpected window creation; open allowlisted links externally
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent renderer navigation away from app://bundle
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    let isTrustedAppUrl = false;
    try {
      const parsedNav = new URL(navigationUrl);
      isTrustedAppUrl = parsedNav.protocol === 'app:' && parsedNav.hostname === 'bundle';
    } catch {
      isTrustedAppUrl = false;
    }
    if (!isTrustedAppUrl) {
      event.preventDefault();
      if (isAllowedExternalUrl(navigationUrl)) {
        void shell.openExternal(navigationUrl);
      }
    }
  });

  void mainWindow.loadURL('app://bundle/index.html');
}

app.whenReady().then(() => {
  // Deny all hardware/browser permission requests by default
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Enforce CSP header on all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [DESKTOP_CSP],
      },
    });
  });

  registerAppProtocol();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
