// =======================================================================
// PhysioRecord Electron — Built-in Local Wi-Fi (LAN) Clinic Sync Hub
// Stores ONLY client-side AES-256-GCM encrypted `.ptsync.json` envelopes.
// Never decrypts PHI and never issues deletions to connected therapists.
// =======================================================================

import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DEFAULT_LAN_SYNC_PORT,
  MAX_SYNC_ENVELOPE_BYTES,
  getValidatedLanCorsOrigin,
  isPrivateLanSyncUrl,
  safeJsonParse,
} from './security.mjs';

const execFileAsync = promisify(execFile);
const WINDOWS_FIREWALL_RULE_NAME = 'PhysioRecord Clinic Wi-Fi Sync';
const VIRTUAL_IFACE_RE =
  /(?:vethernet|wsl|hyper-v|virtualbox|vmware|docker|tailscale|zerotier|radmin|hamachi|vpn|bluetooth|loopback|teredo|isatap)/iu;
const PREFERRED_IFACE_RE = /(?:wi-fi|wifi|wlan|wireless|ethernet|en0|wlan0)/iu;
const MAX_STORED_LAN_DEVICES = 30;
const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_AUTH_FAILURES_PER_IP = 10;
const MAX_EXCHANGE_RESPONSE_BYTES = 40 * 1024 * 1024;

async function isWindowsLanFirewallConfigured() {
  if (process.platform !== 'win32') return true;
  try {
    await execFileAsync(
      'netsh.exe',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${WINDOWS_FIREWALL_RULE_NAME}`],
      { windowsHide: true, timeout: 6_000 }
    );
    return true;
  } catch {
    return false;
  }
}

export function registerLanSyncHandlers({ ipcMain, assertTrustedIpcSender }) {
  let lanSyncServer = null;
  let lanSyncPort = DEFAULT_LAN_SYNC_PORT;
  let lanSyncToken = '';
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
    const ranked = [];
    for (const [ifaceName, ifaces] of Object.entries(nets)) {
      if (!ifaces) continue;
      for (const info of ifaces) {
        if (info.family !== 'IPv4' || info.internal) continue;
        // Skip link-local APIPA addresses (169.254.x.x)
        if (info.address.startsWith('169.254.')) continue;
        let priority = 2;
        if (VIRTUAL_IFACE_RE.test(ifaceName)) {
          priority = 4;
        } else if (PREFERRED_IFACE_RE.test(ifaceName)) {
          priority = info.address.startsWith('192.168.') ? 0 : 1;
        } else if (info.address.startsWith('192.168.')) {
          priority = 1;
        }
        ranked.push({ url: `http://${info.address}:${port}`, priority });
      }
    }
    ranked.sort((first, second) => first.priority - second.priority);
    const urls = Array.from(new Set(ranked.map((entry) => entry.url)));
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
        const parsed = safeJsonParse(raw);
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
    const firewallAllowed = await isWindowsLanFirewallConfigured();
    return {
      running: Boolean(lanSyncServer && lanSyncServer.listening),
      port: lanSyncPort,
      urls: getLanIpv4Urls(lanSyncPort),
      pairingToken: token,
      storedDevicesCount: stored.length,
      firewallAllowed,
    };
  }

  ipcMain.handle('physiorecord:lan-sync-status', async (event) => {
    assertTrustedIpcSender(event);
    return getLanHubStatusPayload();
  });

  ipcMain.handle('physiorecord:lan-sync-allow-firewall', async (event) => {
    assertTrustedIpcSender(event);
    if (process.platform !== 'win32') {
      return { allowed: true, alreadyConfigured: true };
    }
    const safePort = Number.isInteger(lanSyncPort) && lanSyncPort >= 1024 && lanSyncPort <= 65535
      ? lanSyncPort
      : DEFAULT_LAN_SYNC_PORT;
    const exePathEscaped = String(process.execPath || '').replace(/'/gu, "''");
    const ruleNameEscaped = WINDOWS_FIREWALL_RULE_NAME.replace(/'/gu, "''");
    // Remove any auto-created Windows Firewall Block rules for PhysioRecord.exe (which override Allow rules!)
    // and add clean inbound Allow rules for both the executable and TCP port 47821 across all profiles.
    const innerScript = [
      `$exe = '${exePathEscaped}'`,
      'Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | Where-Object { $_.Program -and (($exe -and ([System.Environment]::ExpandEnvironmentVariables($_.Program) -eq $exe)) -or ($_.Program -like "*PhysioRecord.exe")) } | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq "Inbound" -and $_.Action -eq "Block" } | Remove-NetFirewallRule -ErrorAction SilentlyContinue',
      `netsh.exe advfirewall firewall delete rule name="${ruleNameEscaped}" | Out-Null`,
      `netsh.exe advfirewall firewall add rule name="${ruleNameEscaped}" dir=in action=allow protocol=TCP localport=${safePort} profile=any | Out-Null`,
      'if ($exe) {',
      `  netsh.exe advfirewall firewall add rule name="${ruleNameEscaped}" dir=in action=allow program="$exe" profile=any | Out-Null`,
      '}',
    ].join('; ');
    const encodedInner = Buffer.from(innerScript, 'utf16le').toString('base64');
    const launcherScript = `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand','${encodedInner}' -Verb RunAs -WindowStyle Hidden -Wait`;
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', launcherScript],
        { windowsHide: true, timeout: 60_000 }
      );
      const verified = await isWindowsLanFirewallConfigured();
      return { allowed: verified, alreadyConfigured: false };
    } catch {
      return { allowed: false, alreadyConfigured: false };
    }
  });

  ipcMain.handle('physiorecord:lan-sync-start', async (event, options) => {
    assertTrustedIpcSender(event);
    const requestedPort = Number(options?.port) || DEFAULT_LAN_SYNC_PORT;
    lanSyncPort = requestedPort >= 1024 && requestedPort <= 65535 ? requestedPort : DEFAULT_LAN_SYNC_PORT;
    const token = await ensureLanPairingToken();

    if (lanSyncServer && lanSyncServer.listening) {
      return getLanHubStatusPayload();
    }

    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        const allowedOrigin = getValidatedLanCorsOrigin(req.headers.origin);
        if (allowedOrigin) {
          // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
          res.setHeader('Vary', 'Origin');
        }
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
          const pingPayload = JSON.stringify({
            ok: true,
            hub: 'PhysioRecord-LAN-Hub',
            storedDevicesCount: stored.length,
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(pingPayload),
          });
          res.end(pingPayload);
          return;
        }

        if (req.method === 'POST' && req.url === '/api/sync/exchange') {
          try {
            const chunks = [];
            let totalBytes = 0;
            for await (const chunk of req) {
              totalBytes += chunk.length;
              if (totalBytes > MAX_SYNC_ENVELOPE_BYTES) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Envelope exceeds 35MB limit' }));
                return;
              }
              chunks.push(chunk);
            }
            const parsed = safeJsonParse(Buffer.concat(chunks).toString('utf8'));
            const envelope = parsed?.envelope;
            await saveLanEnvelopeAtomic(envelope);
            const peerEnvelopes = await readStoredLanEnvelopes(envelope.deviceId);
            const respPayload = JSON.stringify({ ok: true, peerEnvelopes });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(respPayload),
            });
            res.end(respPayload);
          } catch (err) {
            const errPayload = JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Invalid sync request',
            });
            res.writeHead(400, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(errPayload),
            });
            res.end(errPayload);
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
    if (!isPrivateLanSyncUrl(endpoint.origin) || endpoint.pathname !== '/api/sync/exchange') {
      return {
        ok: false,
        error: 'Blocked non-LAN server URL.',
      };
    }
    const bodyStr = JSON.stringify({ envelope });
    const clientMod = endpoint.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      const req = clientMod.request(
        {
          protocol: endpoint.protocol,
          hostname: endpoint.hostname,
          port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
          path: '/api/sync/exchange',
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
              const json = safeJsonParse(Buffer.concat(chunks).toString('utf8'));
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

  return {
    closeLanSyncServer() {
      if (lanSyncServer) {
        try {
          lanSyncServer.close();
        } catch {
          // ignore
        }
        lanSyncServer = null;
      }
    },
  };
}
