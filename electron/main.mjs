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
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import crypto from 'node:crypto';
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
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (host === 'wa.me' || host === 'api.whatsapp.com') return true;
  if (host === 'google.com' || host === 'www.google.com') {
    return parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/');
  }
  if (host === 'github.com') {
    return /^\/Hhi5\/physiorecord(\/releases(\/[^?#\s]*)?)?\/?$/i.test(parsed.pathname);
  }
  return false;
}

function isPrivateLanSyncUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\s\r\n\0]/.test(trimmed)) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (parsed.pathname !== '' && parsed.pathname !== '/') return false;
  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/.test(host)) return true;

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const octets = ipv4Match.slice(1).map((p) => (p.length > 1 && p.startsWith('0') ? -1 : Number(p)));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

function assertTrustedIpcSender(event) {
  const frameUrl = event?.senderFrame?.url || '';
  if (!frameUrl.startsWith('app://bundle/')) {
    throw new Error('Blocked IPC call from untrusted origin.');
  }
  if (mainWindow && !mainWindow.isDestroyed() && event?.sender?.id !== mainWindow.webContents.id) {
    throw new Error('Blocked IPC call from unknown WebContents.');
  }
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

function fetchGitHubJson(apiUrl) {
  const MAX_GITHUB_JSON_BYTES = 5 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = https.get(
      apiUrl,
      {
        headers: {
          'User-Agent': `PhysioRecord-Desktop/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        let totalBytes = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          totalBytes += Buffer.byteLength(chunk, 'utf8');
          if (totalBytes > MAX_GITHUB_JSON_BYTES) {
            req.destroy(new Error('GitHub API response exceeded 5MB safety limit'));
            return;
          }
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

async function fetchGitHubReleasesList(repoSlug = 'Hhi5/physiorecord') {
  const list = await fetchGitHubJson(
    `https://api.github.com/repos/${repoSlug}/releases?per_page=10`
  );
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }
  const latest = await fetchGitHubJson(
    `https://api.github.com/repos/${repoSlug}/releases/latest`
  );
  return latest && typeof latest === 'object' ? [latest] : [];
}

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

function registerIpcHandlers() {
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
    if (Buffer.byteLength(content, 'utf8') > 100 * 1024 * 1024) {
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
    if (Buffer.byteLength(content, 'utf8') > 100 * 1024 * 1024) {
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

  // Manual opt-in GitHub Releases sync in Main Process ONLY (zero renderer network calls)
  ipcMain.handle('physiorecord:fetch-github-releases', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const releases = await fetchGitHubReleasesList('Hhi5/physiorecord');
      return { ok: true, releases };
    } catch (err) {
      return {
        ok: false,
        releases: [],
        error: err instanceof Error ? err.message : 'Failed to fetch GitHub Releases',
      };
    }
  });

  // Manual opt-in update check in Main Process ONLY (zero renderer network calls)
  ipcMain.handle('physiorecord:check-for-updates', async (event) => {
    assertTrustedIpcSender(event);
    const currentVersion = app.getVersion();
    try {
      const releasesList = await fetchGitHubReleasesList('Hhi5/physiorecord');
      const publishedReleases = releasesList.filter((r) => r && r.draft !== true);
      const release =
        publishedReleases.find((r) => !r.prerelease) || publishedReleases[0] || null;
      const latestTag = String(release?.tag_name || '').replace(/^v/i, '');
      const releaseUrl =
        String(release?.html_url || '') || 'https://github.com/Hhi5/physiorecord/releases';
      const assets = Array.isArray(release?.assets) ? release.assets : [];
      const exeAssets = assets.filter(
        (a) =>
          typeof a?.name === 'string' &&
          a.name.toLowerCase().endsWith('.exe') &&
          typeof a?.browser_download_url === 'string' &&
          a.browser_download_url.startsWith('https://github.com/Hhi5/physiorecord/releases')
      );
      const preferredSetup =
        exeAssets.find((a) => /setup/i.test(a.name)) || exeAssets[0] || null;
      const publishedAt =
        typeof release?.published_at === 'string' ? release.published_at : undefined;
      const releaseNotes =
        typeof release?.body === 'string' && release.body.trim()
          ? release.body.trim().slice(0, 6000)
          : undefined;

      if (latestTag && compareSemver(latestTag, currentVersion) > 0) {
        return {
          status: 'update-available',
          currentVersion,
          latestVersion: latestTag,
          releaseUrl,
          downloadUrl: preferredSetup?.browser_download_url || releaseUrl,
          assetName: preferredSetup?.name,
          assetSizeBytes: typeof preferredSetup?.size === 'number' ? preferredSetup.size : undefined,
          publishedAt,
          releaseNotes,
          releases: publishedReleases,
          messageAr: `يتوفر إصدار جديد (${latestTag}). يُثبَّت فوق النسخة الحالية مباشرة دون حذف بيانات العيادة.`,
          messageEn: `A newer version (${latestTag}) is available. Installing Setup upgrades in place without removing clinic data.`,
        };
      }

      return {
        status: 'up-to-date',
        currentVersion,
        latestVersion: latestTag || currentVersion,
        releaseUrl,
        publishedAt,
        releaseNotes,
        releases: publishedReleases,
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

  // =====================================================================
  // Built-in Local Wi-Fi (LAN) Clinic Sync Hub — Strictly Non-Destructive
  // Stores ONLY client-side AES-256-GCM encrypted `.ptsync.json` envelopes.
  // Never decrypts PHI and never issues deletions to connected therapists.
  // =====================================================================
  let lanSyncServer = null;
  let lanSyncPort = 47821;
  let lanSyncToken = '';
  const MAX_STORED_LAN_DEVICES = 30;
  const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000;
  const MAX_AUTH_FAILURES_PER_IP = 10;
  const authFailuresByIp = new Map();

  function isLanClientRateLimited(remoteAddr) {
    const ip = String(remoteAddr || 'unknown');
    const now = Date.now();
    const record = authFailuresByIp.get(ip);
    if (!record) return false;
    if (now - record.windowStart > AUTH_FAILURE_WINDOW_MS) {
      authFailuresByIp.delete(ip);
      return false;
    }
    return record.count >= MAX_AUTH_FAILURES_PER_IP;
  }

  function recordLanAuthFailure(remoteAddr) {
    const ip = String(remoteAddr || 'unknown');
    const now = Date.now();
    const record = authFailuresByIp.get(ip);
    if (!record || now - record.windowStart > AUTH_FAILURE_WINDOW_MS) {
      authFailuresByIp.set(ip, { count: 1, windowStart: now });
    } else {
      record.count += 1;
    }
    if (authFailuresByIp.size > 500) {
      authFailuresByIp.clear();
    }
  }

  function clearLanAuthFailures(remoteAddr) {
    authFailuresByIp.delete(String(remoteAddr || 'unknown'));
  }

  const getLanSyncDir = () => path.resolve(app.getPath('userData'), 'lan-sync-envelopes');
  const getLanTokenFile = () => path.resolve(app.getPath('userData'), 'lan-sync-token.txt');

  async function ensureLanPairingToken() {
    if (lanSyncToken) return lanSyncToken;
    const tokenPath = getLanTokenFile();
    try {
      const existing = (await fs.readFile(tokenPath, 'utf8')).trim();
      if (existing.length >= 8) {
        lanSyncToken = existing;
        return lanSyncToken;
      }
    } catch {
      // generate fresh token
    }
    // 64-bit CSPRNG pairing token (16 hex characters) stored with owner-only permissions
    lanSyncToken = crypto.randomBytes(8).toString('hex').toUpperCase();
    await fs.writeFile(tokenPath, lanSyncToken, { encoding: 'utf8', mode: 0o600 });
    return lanSyncToken;
  }

  function getLanIpv4Urls(port) {
    const nets = os.networkInterfaces();
    const urls = [];
    for (const ifaces of Object.values(nets)) {
      if (!ifaces) continue;
      for (const info of ifaces) {
        if (info.family === 'IPv4' && !info.internal) {
          urls.push(`http://${info.address}:${port}`);
        }
      }
    }
    if (urls.length === 0) {
      urls.push(`http://127.0.0.1:${port}`);
    }
    return urls;
  }

  async function readStoredLanEnvelopes(excludeDeviceId = '') {
    const dir = getLanSyncDir();
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir);
    const envelopes = [];
    for (const name of entries) {
      if (!name.endsWith('.ptsync.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.magic === 'PHYSIORECORD_SYNC_V1' && parsed.deviceId !== excludeDeviceId) {
          envelopes.push(parsed);
        }
      } catch {
        // skip corrupted envelope
      }
    }
    return envelopes;
  }

  async function saveLanEnvelopeAtomic(envelope) {
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      envelope.magic !== 'PHYSIORECORD_SYNC_V1' ||
      envelope.schemaVersion !== 1 ||
      envelope.kdf !== 'PBKDF2-SHA256' ||
      typeof envelope.deviceId !== 'string' ||
      typeof envelope.saltBase64 !== 'string' ||
      typeof envelope.ivBase64 !== 'string' ||
      typeof envelope.ciphertextBase64 !== 'string' ||
      !Number.isInteger(Number(envelope.iterations)) ||
      Number(envelope.iterations) < 100_000 ||
      Number(envelope.iterations) > 1_000_000
    ) {
      throw new Error('Invalid encrypted sync envelope');
    }
    const safeDeviceId = envelope.deviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (!safeDeviceId || safeDeviceId.length < 4) throw new Error('Invalid deviceId');

    const dir = getLanSyncDir();
    await fs.mkdir(dir, { recursive: true });
    const targetPath = path.resolve(dir, `${safeDeviceId}.ptsync.json`);
    if (!targetPath.startsWith(dir + path.sep)) {
      throw new Error('Invalid sync envelope target path');
    }

    // Prevent disk exhaustion from unbounded spoofed device IDs
    const existingFiles = (await fs.readdir(dir)).filter((n) => n.endsWith('.ptsync.json'));
    const alreadyExists = existingFiles.includes(`${safeDeviceId}.ptsync.json`);
    if (!alreadyExists && existingFiles.length >= MAX_STORED_LAN_DEVICES) {
      throw new Error('Clinic LAN Hub reached maximum stored device limit (30)');
    }

    const tmpPath = `${targetPath}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmpPath, targetPath);
  }

  function tokensEqualSafe(a, b) {
    const bufA = Buffer.from(String(a || ''));
    const bufB = Buffer.from(String(b || ''));
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  async function getLanHubStatusPayload() {
    const token = await ensureLanPairingToken();
    const stored = await readStoredLanEnvelopes('');
    return {
      running: Boolean(lanSyncServer && lanSyncServer.listening),
      port: lanSyncPort,
      urls: getLanIpv4Urls(lanSyncPort),
      pairingToken: token,
      storedDevicesCount: stored.length,
    };
  }

  ipcMain.handle('physiorecord:lan-sync-status', async (event) => {
    assertTrustedIpcSender(event);
    return getLanHubStatusPayload();
  });

  ipcMain.handle('physiorecord:lan-sync-start', async (event, options) => {
    assertTrustedIpcSender(event);
    const requestedPort = Number(options?.port) || 47821;
    lanSyncPort = requestedPort >= 1024 && requestedPort <= 65535 ? requestedPort : 47821;
    const token = await ensureLanPairingToken();

    if (lanSyncServer && lanSyncServer.listening) {
      return getLanHubStatusPayload();
    }

    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Clinic-Token');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const remoteAddr = req.socket?.remoteAddress || 'unknown';
        if (isLanClientRateLimited(remoteAddr)) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: 'Too many invalid pairing token attempts. Please wait 5 minutes.',
            })
          );
          return;
        }

        const headerToken = req.headers['x-clinic-token'];
        if (!tokensEqualSafe(headerToken, token)) {
          recordLanAuthFailure(remoteAddr);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized clinic pairing token' }));
          return;
        }
        clearLanAuthFailures(remoteAddr);

        if (req.method === 'GET' && req.url === '/api/sync/ping') {
          const stored = await readStoredLanEnvelopes('');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, hub: 'PhysioRecord-LAN-Hub', storedDevicesCount: stored.length }));
          return;
        }

        if (req.method === 'POST' && req.url === '/api/sync/exchange') {
          try {
            const chunks = [];
            let totalBytes = 0;
            const MAX_BODY_BYTES = 35 * 1024 * 1024;
            for await (const chunk of req) {
              totalBytes += chunk.length;
              if (totalBytes > MAX_BODY_BYTES) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Envelope exceeds 35MB limit' }));
                return;
              }
              chunks.push(chunk);
            }
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const envelope = parsed?.envelope;
            await saveLanEnvelopeAtomic(envelope);
            const peerEnvelopes = await readStoredLanEnvelopes(envelope.deviceId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, peerEnvelopes }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Invalid sync request',
              })
            );
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      });

      // Mitigate Slowloris / hanging connections on clinic LAN
      server.headersTimeout = 10_000;
      server.requestTimeout = 30_000;
      server.keepAliveTimeout = 5_000;

      server.on('error', async (err) => {
        const status = await getLanHubStatusPayload();
        resolve({
          ...status,
          running: false,
          error: err instanceof Error ? err.message : 'Could not bind LAN sync port',
        });
      });

      server.listen(lanSyncPort, '0.0.0.0', async () => {
        lanSyncServer = server;
        resolve(await getLanHubStatusPayload());
      });
    });
  });

  ipcMain.handle('physiorecord:lan-sync-stop', async (event) => {
    assertTrustedIpcSender(event);
    if (lanSyncServer) {
      await new Promise((resolve) => lanSyncServer.close(() => resolve(undefined)));
      lanSyncServer = null;
    }
    return { running: false };
  });

  // Main-process HTTP client for LAN sync exchange (keeps Electron renderer CSP connect-src 'none' intact)
  ipcMain.handle('physiorecord:lan-sync-exchange', async (event, payload) => {
    assertTrustedIpcSender(event);
    const serverUrl = String(payload?.serverUrl || '').trim().replace(/\/+$/, '');
    const pairingToken = String(payload?.pairingToken || '').trim();
    const envelope = payload?.envelope;

    if (!isPrivateLanSyncUrl(serverUrl)) {
      return {
        ok: false,
        error: 'Blocked non-LAN server URL. Only private clinic Wi-Fi IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost) are allowed.',
      };
    }

    const endpoint = new URL(`${serverUrl}/api/sync/exchange`);
    const bodyStr = JSON.stringify({ envelope });
    const clientMod = endpoint.protocol === 'https:' ? https : http;
    const MAX_EXCHANGE_RESPONSE_BYTES = 40 * 1024 * 1024;

    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      const req = clientMod.request(
        endpoint,
        {
          method: 'POST',
          timeout: 12000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
            'X-Clinic-Token': pairingToken,
          },
        },
        (res) => {
          const chunks = [];
          let totalBytes = 0;
          res.on('data', (c) => {
            totalBytes += c.length;
            if (totalBytes > MAX_EXCHANGE_RESPONSE_BYTES) {
              req.destroy();
              done({ ok: false, error: 'LAN Hub response exceeded 40MB safety limit' });
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => {
            if (settled) return;
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                done({ ok: true, peerEnvelopes: Array.isArray(json.peerEnvelopes) ? json.peerEnvelopes : [] });
              } else {
                done({ ok: false, error: json.error || `HTTP ${res.statusCode}` });
              }
            } catch {
              done({ ok: false, error: 'Invalid JSON response from LAN Hub' });
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        done({ ok: false, error: 'LAN Hub connection timed out' });
      });
      req.on('error', (err) => {
        done({ ok: false, error: err instanceof Error ? err.message : 'LAN Hub unreachable' });
      });

      req.write(bodyStr);
      req.end();
    });
  });

  let activeOAuthServer = null;

  function randomBase64Url(byteLen) {
    return crypto.randomBytes(byteLen).toString('base64url');
  }

  function sha256Base64Url(input) {
    return crypto.createHash('sha256').update(input, 'ascii').digest('base64url');
  }

  function isAllowedGoogleDriveApiUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();
    if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    if (parsed.hostname.toLowerCase() !== 'www.googleapis.com') return false;
    return (
      parsed.pathname.startsWith('/drive/v3/') ||
      parsed.pathname.startsWith('/upload/drive/v3/')
    );
  }

  function httpsTextRequest(urlStr, { method = 'GET', headers = {}, body = undefined, timeoutMs = 15000, maxBytes = 35 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
      const target = new URL(urlStr);
      const reqHeaders = { ...headers };
      const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : undefined;
      if (bodyBuf && !reqHeaders['Content-Length']) {
        reqHeaders['Content-Length'] = String(bodyBuf.length);
      }

      const req = https.request(
        target,
        {
          method,
          headers: reqHeaders,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          let totalBytes = 0;
          res.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
              req.destroy(new Error('Google API response exceeded 35MB safety limit'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            const status = res.statusCode || 0;
            const text = Buffer.concat(chunks).toString('utf8');
            const contentLength = Number(res.headers['content-length'] || 0) || totalBytes;
            resolve({
              ok: status >= 200 && status < 300,
              status,
              text,
              contentLength,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Google API request timed out'));
      });
      req.on('error', reject);
      if (bodyBuf) {
        req.write(bodyBuf);
      }
      req.end();
    });
  }

  // Native Desktop OAuth 2.0 PKCE loopback via default system browser (bypasses broken Firebase popup on app://)
  ipcMain.handle('physiorecord:google-drive-oauth', async (event, options) => {
    assertTrustedIpcSender(event);
    const clientId = String(options?.clientId || '').trim();
    const clientSecret = String(options?.clientSecret || '').trim();
    const scope =
      String(options?.scope || '').trim() ||
      'https://www.googleapis.com/auth/drive.file openid email profile';

    if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) {
      throw new Error('Invalid Google OAuth Client ID.');
    }

    if (activeOAuthServer) {
      try {
        activeOAuthServer.close();
      } catch {
        // ignore
      }
      activeOAuthServer = null;
    }

    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(48);
    const codeChallenge = sha256Base64Url(codeVerifier);

    const { authCode, redirectUri } = await new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      let boundRedirectUri = '';
      const server = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
          if (reqUrl.pathname !== '/oauth2callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
          }
          const returnedState = reqUrl.searchParams.get('state');
          const returnedError = reqUrl.searchParams.get('error');
          const returnedCode = reqUrl.searchParams.get('code');
          const ok = Boolean(!returnedError && returnedCode && returnedState === state);

          const html = ok
            ? '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#f0fdf4;color:#065f46;}</style></head><body><h2>تم ربط Google Drive بنجاح</h2><p>يمكنك إغلاق هذه الصفحة والعودة إلى تطبيق PhysioRecord على الحاسبة.</p><p dir="ltr">Connected successfully. Return to PhysioRecord.</p></body></html>'
            : '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#fef2f2;color:#991b1b;}</style></head><body><h2>تعذّر إكمال تسجيل الدخول</h2><p>يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.</p></body></html>';

          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(html);

          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            try {
              server.close();
            } catch {
              // ignore
            }
            if (activeOAuthServer === server) activeOAuthServer = null;
            if (ok) {
              resolve({
                authCode: returnedCode,
                redirectUri: boundRedirectUri,
              });
            } else {
              reject(new Error(`OAuth cancelled or failed: ${returnedError || 'state_mismatch'}`));
            }
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            reject(err);
          }
        }
      });

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          if (activeOAuthServer === server) activeOAuthServer = null;
          reject(err);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        activeOAuthServer = server;
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        boundRedirectUri = `http://127.0.0.1:${port}/oauth2callback`;

        const authUrl =
          'https://accounts.google.com/o/oauth2/v2/auth' +
          `?client_id=${encodeURIComponent(clientId)}` +
          `&redirect_uri=${encodeURIComponent(boundRedirectUri)}` +
          '&response_type=code' +
          `&scope=${encodeURIComponent(scope)}` +
          `&state=${encodeURIComponent(state)}` +
          `&code_challenge=${encodeURIComponent(codeChallenge)}` +
          '&code_challenge_method=S256' +
          '&prompt=select_account';

        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              server.close();
            } catch {
              // ignore
            }
            if (activeOAuthServer === server) activeOAuthServer = null;
            reject(new Error('OAuth timed out before completing sign-in.'));
          }
        }, 180_000);

        shell.openExternal(authUrl).catch((err) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            try {
              server.close();
            } catch {
              // ignore
            }
            if (activeOAuthServer === server) activeOAuthServer = null;
            reject(new Error(`Could not launch system browser: ${err?.message || err}`));
          }
        });
      });
    });

    const formParams = new URLSearchParams({
      code: authCode,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    if (clientSecret) {
      formParams.set('client_secret', clientSecret);
    }

    const tokenResp = await httpsTextRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formParams.toString(),
      timeoutMs: 12000,
      maxBytes: 1024 * 1024,
    });

    if (!tokenResp.ok) {
      throw new Error(`Google token exchange failed (HTTP ${tokenResp.status}): ${tokenResp.text.slice(0, 200)}`);
    }

    const tokenJson = JSON.parse(tokenResp.text);
    const accessToken = String(tokenJson.access_token || '');
    if (!accessToken) {
      throw new Error('Google did not return an access token.');
    }

    let email = '';
    let displayName = '';
    let photoURL = '';
    try {
      const infoResp = await httpsTextRequest('https://www.googleapis.com/oauth2/v3/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 8000,
        maxBytes: 256 * 1024,
      });
      if (infoResp.ok) {
        const infoJson = JSON.parse(infoResp.text);
        email = String(infoJson.email || '');
        displayName = String(infoJson.name || '');
        photoURL = String(infoJson.picture || '');
      }
    } catch {
      // Optional user profile fetch
    }

    return { accessToken, email, displayName, photoURL };
  });

  // Strictly allowlisted Main-Process Google Drive v3 API proxy (keeps renderer CSP `connect-src 'none'` intact)
  ipcMain.handle('physiorecord:google-drive-api', async (event, options) => {
    assertTrustedIpcSender(event);
    const url = String(options?.url || '').trim();
    const method = String(options?.method || 'GET').toUpperCase();
    if (!isAllowedGoogleDriveApiUrl(url)) {
      throw new Error('Blocked non-allowlisted Google Drive API URL.');
    }
    if (!['GET', 'POST', 'PATCH'].includes(method)) {
      throw new Error('Blocked unsupported Google Drive HTTP method.');
    }
    const rawHeaders = options?.headers && typeof options.headers === 'object' ? options.headers : {};
    const safeHeaders = {};
    if (typeof rawHeaders.Authorization === 'string' && rawHeaders.Authorization.startsWith('Bearer ')) {
      safeHeaders.Authorization = rawHeaders.Authorization;
    }
    if (typeof rawHeaders['Content-Type'] === 'string' && rawHeaders['Content-Type'].length <= 200) {
      safeHeaders['Content-Type'] = rawHeaders['Content-Type'];
    }
    const body = typeof options?.body === 'string' ? options.body : undefined;
    if (body && Buffer.byteLength(body, 'utf8') > 35 * 1024 * 1024) {
      throw new Error('Google Drive upload body exceeds 35MB safety limit.');
    }

    return await httpsTextRequest(url, {
      method,
      headers: safeHeaders,
      body,
      timeoutMs: 25000,
      maxBytes: 35 * 1024 * 1024,
    });
  });

  // 1-Click Desktop Google Drive / Cloud Sync Folder (works with Google Drive for Desktop with ZERO OAuth setup)
  ipcMain.handle('physiorecord:pick-sync-dir', async (event) => {
    assertTrustedIpcSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر مجلد المزامنة (مثلاً مجلد Google Drive على الحاسبة)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { configured: false, cancelled: true };
    }
    const folderPath = result.filePaths[0];
    const current = await readDesktopConfig();
    await writeDesktopConfig({ ...current, syncDirectoryPath: folderPath });
    return {
      configured: true,
      cancelled: false,
      folderPath,
      folderName: path.basename(folderPath) || folderPath,
    };
  });

  ipcMain.handle('physiorecord:get-sync-dir', async (event) => {
    assertTrustedIpcSender(event);
    const current = await readDesktopConfig();
    const folderPath = typeof current.syncDirectoryPath === 'string' ? current.syncDirectoryPath : '';
    if (!folderPath) {
      return { configured: false };
    }
    try {
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) return { configured: false };
      return {
        configured: true,
        folderPath,
        folderName: path.basename(folderPath) || folderPath,
      };
    } catch {
      return { configured: false };
    }
  });

  ipcMain.handle('physiorecord:clear-sync-dir', async (event) => {
    assertTrustedIpcSender(event);
    const current = await readDesktopConfig();
    delete current.syncDirectoryPath;
    await writeDesktopConfig(current);
  });

  ipcMain.handle('physiorecord:sync-folder-exchange', async (event, payload) => {
    assertTrustedIpcSender(event);
    const current = await readDesktopConfig();
    const folderPath = typeof current.syncDirectoryPath === 'string' ? current.syncDirectoryPath : '';
    if (!folderPath) {
      return { ok: false, error: 'لم يتم اختيار مجلد المزامنة بعد.' };
    }
    const localEnvelope = payload?.localEnvelope;
    const rawDeviceId = String(localEnvelope?.deviceId || '').trim();
    if (!localEnvelope || localEnvelope.magic !== 'PHYSIORECORD_SYNC_V1' || !/^[a-zA-Z0-9_-]{3,80}$/.test(rawDeviceId)) {
      return { ok: false, error: 'بيانات ملف المزامنة غير صالحة.' };
    }

    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return { ok: false, error: 'مجلد المزامنة المختار غير موجود حالياً — يرجى اختياره مجدداً.' };
    }

    const localFileName = `sync_${rawDeviceId}.ptsync.json`;
    const localTargetPath = path.join(folderPath, localFileName);
    await writeTextFileAtomically(localTargetPath, JSON.stringify(localEnvelope, null, 2));

    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const peerEnvelopes = [];
    const MAX_FILE_BYTES = 35 * 1024 * 1024;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.ptsync.json')) continue;
      if (entry.name === localFileName) continue;
      const fullPath = path.join(folderPath, entry.name);
      try {
        const fStat = await fs.stat(fullPath);
        if (fStat.size > MAX_FILE_BYTES) continue;
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.magic === 'PHYSIORECORD_SYNC_V1' && parsed.deviceId !== rawDeviceId) {
          peerEnvelopes.push(parsed);
        }
      } catch {
        // Ignore unreadable or partially synced peer files
      }
    }

    return {
      ok: true,
      folderName: path.basename(folderPath) || folderPath,
      writtenFile: localFileName,
      peerEnvelopes,
    };
  });

  app.on('before-quit', () => {
    if (lanSyncServer) {
      try {
        lanSyncServer.close();
      } catch {
        // ignore
      }
      lanSyncServer = null;
    }
    if (activeOAuthServer) {
      try {
        activeOAuthServer.close();
      } catch {
        // ignore
      }
      activeOAuthServer = null;
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
