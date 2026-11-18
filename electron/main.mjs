// =======================================================================
// PhysioRecord — Hardened Electron Main Process (Windows Desktop Shell)
// - Locked identity: appId = org.physiorecord.app, productName = PhysioRecord
// - Locked origin: custom privileged scheme `app://bundle` -> `%APPDATA%\PhysioRecord`
// - Zero renderer network access: strict `connect-src 'none'` CSP
// - Atomic file writes (.tmp + rename) for .ptbackup & configured backup directories
// - Manual opt-in update check in Main Process only (GitHub Releases API)
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
import https from 'node:https';
import { fileURLToPath } from 'node:url';

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

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const DESKTOP_CSP = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' app: 'unsafe-inline'",
  "img-src 'self' app: data: blob:",
  "font-src 'self' app: data:",
  "worker-src 'self' app: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'desktop-bridge-config.json');
}

async function readDesktopConfig() {
  try {
    const raw = await fs.readFile(getSettingsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDesktopConfig(nextConfig) {
  const filePath = getSettingsFilePath();
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(nextConfig, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

async function writeTextFileAtomically(targetPath, content) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${targetPath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, targetPath);
}

function isAllowedExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.startsWith('https://wa.me/') ||
    url.startsWith('https://api.whatsapp.com/') ||
    url.startsWith('https://www.google.com/maps/') ||
    url.startsWith('https://google.com/maps/') ||
    url.startsWith('https://github.com/Hhi5/physiorecord/releases')
  );
}

function compareSemver(a, b) {
  const cleanA = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const cleanB = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((cleanA[i] || 0) > (cleanB[i] || 0)) return 1;
    if ((cleanA[i] || 0) < (cleanB[i] || 0)) return -1;
  }
  return 0;
}

function fetchLatestGitHubRelease(repoSlug = 'Hhi5/physiorecord') {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${repoSlug}/releases/latest`,
      {
        headers: {
          'User-Agent': `PhysioRecord-Desktop/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

function registerAppProtocol() {
  const distDir = path.resolve(__dirname, '..', 'dist');

  protocol.handle('app', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let reqPath = decodeURIComponent(parsedUrl.pathname || '/');
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      const normalizedRel = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let candidatePath = path.join(distDir, normalizedRel);

      // Ensure resolved path stays strictly inside distDir
      if (!candidatePath.startsWith(distDir)) {
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

function registerIpcHandlers() {
  ipcMain.handle('physiorecord:get-app-info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    appId: 'org.physiorecord.app',
  }));

  ipcMain.handle('physiorecord:save-file', async (_event, payload) => {
    const filename = String(payload?.filename || 'PhysioRecord_Export.ptbackup');
    const content = String(payload?.content ?? '');
    const ext = path.extname(filename).replace(/^\./, '') || 'ptbackup';
    const description = String(payload?.description || 'PhysioRecord File');

    const result = await dialog.showSaveDialog(mainWindow, {
      title: description,
      defaultPath: filename,
      filters: [
        { name: description, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

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

  ipcMain.handle('physiorecord:pick-backup-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Automatic Encrypted Backup Folder (.ptbackup)',
      properties: ['openDirectory', 'createDirectory'],
    });

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

  ipcMain.handle('physiorecord:get-backup-dir', async () => {
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

  ipcMain.handle('physiorecord:clear-backup-dir', async () => {
    const cfg = await readDesktopConfig();
    delete cfg.backupDirectory;
    await writeDesktopConfig(cfg);
  });

  ipcMain.handle('physiorecord:write-backup-dir', async (_event, payload) => {
    const cfg = await readDesktopConfig();
    const folderPath = cfg.backupDirectory;
    if (!folderPath || !fsSync.existsSync(folderPath)) {
      return { written: false };
    }

    const safeFilename = path.basename(String(payload?.filename || 'PhysioRecord_Backup.ptbackup'));
    const targetPath = path.join(folderPath, safeFilename);
    await writeTextFileAtomically(targetPath, String(payload?.content ?? ''));

    return {
      written: true,
      folderName: path.basename(folderPath) || folderPath,
      filePath: targetPath,
    };
  });

  ipcMain.handle('physiorecord:print-page', async (_event, payload) => {
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

  ipcMain.handle('physiorecord:export-pdf', async (_event, payload) => {
    if (!mainWindow) return { saved: false };
    const suggestedName = String(payload?.suggestedName || 'PhysioRecord_Document.pdf');

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

  ipcMain.handle('physiorecord:open-external', async (_event, payload) => {
    const url = String(payload?.url || '');
    if (!isAllowedExternalUrl(url)) {
      return { opened: false };
    }
    await shell.openExternal(url);
    return { opened: true };
  });

  // Manual opt-in update check in Main Process ONLY (zero renderer network calls)
  ipcMain.handle('physiorecord:check-for-updates', async () => {
    const currentVersion = app.getVersion();
    try {
      const release = await fetchLatestGitHubRelease('Hhi5/physiorecord');
      const latestTag = String(release?.tag_name || '').replace(/^v/i, '');
      const releaseUrl =
        String(release?.html_url || '') || 'https://github.com/Hhi5/physiorecord/releases';

      if (latestTag && compareSemver(latestTag, currentVersion) > 0) {
        return {
          status: 'update-available',
          currentVersion,
          latestVersion: latestTag,
          releaseUrl,
          messageAr: `يتوفر إصدار جديد (${latestTag}). يمكنك تحميل المثبت المحدث من صفحة الإصدارات الرسمية.`,
          messageEn: `A newer version (${latestTag}) is available on GitHub Releases.`,
        };
      }

      return {
        status: 'up-to-date',
        currentVersion,
        latestVersion: latestTag || currentVersion,
        releaseUrl,
        messageAr: `أنت تستخدم أحدث إصدار حالياً (${currentVersion}).`,
        messageEn: `You are running the latest version (${currentVersion}).`,
      };
    } catch (err) {
      return {
        status: 'error',
        currentVersion,
        messageAr:
          'تعذر التحقق من التحديثات (تأكد من الاتصال بالإنترنت أو راجع صفحة GitHub Releases يدوياً).',
        messageEn:
          err instanceof Error
            ? `Could not check for updates: ${err.message}`
            : 'Could not check for updates.',
      };
    }
  });
}

function createMainWindow() {
  const windowIconPath = path.join(
    __dirname,
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 360,
    minHeight: 640,
    title: 'PhysioRecord',
    ...(fsSync.existsSync(windowIconPath) ? { icon: windowIconPath } : {}),
    autoHideMenuBar: true,
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

  // Block any unexpected window creation; open allowlisted links externally
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent renderer navigation away from app://bundle
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('app://bundle')) {
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
