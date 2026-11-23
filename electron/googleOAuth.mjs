// =======================================================================
// PhysioRecord Electron — Desktop Google Drive OAuth PKCE, API Proxy,
// and Local Cloud-Folder Sync Exchange
// =======================================================================

import { dialog, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import {
  MAX_SYNC_ENVELOPE_BYTES,
  readDesktopConfig,
  safeJsonParse,
  writeDesktopConfig,
  writeTextFileAtomically,
} from './security.mjs';

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

const ALLOWED_GOOGLE_HTTPS_HOSTS = new Set([
  'www.googleapis.com',
  'oauth2.googleapis.com',
]);

function httpsTextRequest(
  urlStr,
  {
    method = 'GET',
    headers = {},
    body = undefined,
    timeoutMs = 15000,
    maxBytes = MAX_SYNC_ENVELOPE_BYTES,
  } = {}
) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const cleanHost = target.hostname.toLowerCase();
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      (target.port && target.port !== '443') ||
      !ALLOWED_GOOGLE_HTTPS_HOSTS.has(cleanHost)
    ) {
      reject(new Error('Blocked non-allowlisted Google HTTPS endpoint.'));
      return;
    }
    const reqHeaders = { ...headers };
    const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : undefined;
    if (bodyBuf && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = String(bodyBuf.length);
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: cleanHost,
        port: 443,
        path: `${target.pathname}${target.search}`,
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

export function registerGoogleDriveHandlers({ ipcMain, assertTrustedIpcSender, getMainWindow }) {
  let activeOAuthServer = null;

  // Native Desktop OAuth 2.0 PKCE loopback via default system browser
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

    const focusMainWindow = () => {
      try {
        const mainWin = getMainWindow?.();
        if (mainWin && !mainWin.isDestroyed()) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
        }
      } catch {
        // Ignore window focus errors
      }
    };

    const sendCallbackHtml = (res, isSuccess, detailAr, detailEn) => {
      const html = isSuccess
        ? '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#f0fdf4;color:#065f46;}</style></head><body><h2>تم ربط Google Drive بنجاح</h2><p>يمكنك إغلاق هذه الصفحة والعودة إلى تطبيق PhysioRecord على الحاسبة.</p><p dir="ltr">Connected successfully. Return to PhysioRecord.</p></body></html>'
        : `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>PhysioRecord</title><style>body{font-family:sans-serif;text-align:center;padding:48px 20px;background:#fef2f2;color:#991b1b;}</style></head><body><h2>تعذّر إكمال تسجيل الدخول</h2><p>${detailAr}</p><p dir="ltr">${detailEn}</p></body></html>`;

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      res.end(html);
    };

    return await new Promise((resolve, reject) => {
      let settled = false;
      let handlingCallback = false;
      let timer = null;
      let boundRedirectUri = '';

      const closeServer = (server) => {
        try {
          server.close();
        } catch {
          // ignore
        }
        if (activeOAuthServer === server) activeOAuthServer = null;
      };

      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
          if (reqUrl.pathname !== '/oauth2callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
          }
          if (handlingCallback || settled) {
            res.writeHead(204);
            res.end();
            return;
          }
          handlingCallback = true;

          const returnedState = reqUrl.searchParams.get('state');
          const returnedError = reqUrl.searchParams.get('error');
          const returnedCode = reqUrl.searchParams.get('code');
          const callbackOk = Boolean(!returnedError && returnedCode && returnedState === state);

          if (!callbackOk) {
            sendCallbackHtml(
              res,
              false,
              'تم إلغاء تسجيل الدخول أو انتهت صلاحية الجلسة. يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.',
              'Sign-in was cancelled or expired. Please return to PhysioRecord and try again.'
            );
            settled = true;
            if (timer) clearTimeout(timer);
            closeServer(server);
            focusMainWindow();
            reject(new Error(`OAuth cancelled or failed: ${returnedError || 'state_mismatch'}`));
            return;
          }

          const formParams = new URLSearchParams({
            code: returnedCode,
            client_id: clientId,
            redirect_uri: boundRedirectUri,
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
            const missingSecret = /client_secret\s+is\s+missing/iu.test(tokenResp.text);
            sendCallbackHtml(
              res,
              false,
              missingSecret
                ? 'تعذّر إتمام الربط لأن المفتاح السري للتطبيق (Client Secret) غير مُعدّ. يرجى العودة إلى PhysioRecord وإدخاله أو تحديث النسخة.'
                : 'رفض خادم Google إتمام تبادل رمز الدخول. يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.',
              missingSecret
                ? 'Google rejected the Desktop OAuth exchange because client_secret is missing. Return to PhysioRecord.'
                : 'Google rejected the OAuth token exchange. Please return to PhysioRecord and try again.'
            );
            settled = true;
            if (timer) clearTimeout(timer);
            closeServer(server);
            focusMainWindow();
            reject(
              new Error(
                `Google token exchange failed (HTTP ${tokenResp.status}): ${tokenResp.text.slice(0, 200)}`
              )
            );
            return;
          }

          const tokenJson = JSON.parse(tokenResp.text);
          const accessToken = String(tokenJson.access_token || '');
          if (!accessToken) {
            sendCallbackHtml(
              res,
              false,
              'لم يُرجع Google رمز صلاحية صالحاً. يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.',
              'Google did not return a valid access token. Please return to PhysioRecord.'
            );
            settled = true;
            if (timer) clearTimeout(timer);
            closeServer(server);
            focusMainWindow();
            reject(new Error('Google did not return an access token.'));
            return;
          }

          let email = '';
          let displayName = '';
          let photoURL = '';
          try {
            const infoResp = await httpsTextRequest(
              'https://www.googleapis.com/oauth2/v3/userinfo',
              {
                method: 'GET',
                headers: { Authorization: `Bearer ${accessToken}` },
                timeoutMs: 8000,
                maxBytes: 256 * 1024,
              }
            );
            if (infoResp.ok) {
              const infoJson = JSON.parse(infoResp.text);
              email = String(infoJson.email || '');
              displayName = String(infoJson.name || '');
              photoURL = String(infoJson.picture || '');
            }
          } catch {
            // Optional user profile fetch
          }

          sendCallbackHtml(res, true, '', '');
          settled = true;
          if (timer) clearTimeout(timer);
          closeServer(server);
          focusMainWindow();
          resolve({ accessToken, email, displayName, photoURL });
        } catch (err) {
          try {
            if (!res.headersSent) {
              sendCallbackHtml(
                res,
                false,
                'حدث خطأ غير متوقع أثناء إكمال تسجيل الدخول. يرجى العودة إلى تطبيق PhysioRecord والمحاولة مجدداً.',
                'Unexpected error while completing sign-in. Please return to PhysioRecord.'
              );
            }
          } catch {
            // ignore
          }
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            closeServer(server);
            focusMainWindow();
            reject(err);
          }
        }
      });

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          closeServer(server);
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
            closeServer(server);
            reject(new Error('OAuth timed out before completing sign-in.'));
          }
        }, 180_000);

        shell.openExternal(authUrl).catch((err) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            closeServer(server);
            reject(new Error(`Could not launch system browser: ${err?.message || err}`));
          }
        });
      });
    });
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
    if (body && Buffer.byteLength(body, 'utf8') > MAX_SYNC_ENVELOPE_BYTES) {
      throw new Error('Google Drive upload body exceeds 35MB safety limit.');
    }

    return await httpsTextRequest(url, {
      method,
      headers: safeHeaders,
      body,
      timeoutMs: 25000,
      maxBytes: MAX_SYNC_ENVELOPE_BYTES,
    });
  });

  // 1-Click Desktop Google Drive / Cloud Sync Folder (works with Google Drive for Desktop with ZERO OAuth setup)
  ipcMain.handle('physiorecord:pick-sync-dir', async (event) => {
    assertTrustedIpcSender(event);
    const result = await dialog.showOpenDialog(getMainWindow(), {
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
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.ptsync.json')) continue;
      if (entry.name === localFileName) continue;
      const fullPath = path.join(folderPath, entry.name);
      try {
        const fStat = await fs.stat(fullPath);
        if (fStat.size > MAX_SYNC_ENVELOPE_BYTES) continue;
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = safeJsonParse(raw);
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

  return {
    closeOAuthServer() {
      if (activeOAuthServer) {
        try {
          activeOAuthServer.close();
        } catch {
          // ignore
        }
        activeOAuthServer = null;
      }
    },
  };
}
