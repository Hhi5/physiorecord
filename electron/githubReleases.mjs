// =======================================================================
// PhysioRecord Electron — Main-Process GitHub Releases & Update Checker
// Manual opt-in only; keeps renderer CSP connect-src 'none' intact.
// =======================================================================

import { app } from 'electron';
import https from 'node:https';
import { OFFICIAL_GITHUB_REPO } from './security.mjs';

const MAX_GITHUB_JSON_BYTES = 5 * 1024 * 1024;

export function compareSemver(a, b) {
  const cleanA = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const cleanB = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((cleanA[i] || 0) > (cleanB[i] || 0)) return 1;
    if ((cleanA[i] || 0) < (cleanB[i] || 0)) return -1;
  }
  return 0;
}

function fetchGitHubJson(apiUrl) {
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

async function fetchGitHubReleasesList(repoSlug = OFFICIAL_GITHUB_REPO) {
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

export function registerGitHubReleaseHandlers({ ipcMain, assertTrustedIpcSender }) {
  ipcMain.handle('physiorecord:fetch-github-releases', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const releases = await fetchGitHubReleasesList(OFFICIAL_GITHUB_REPO);
      return { ok: true, releases };
    } catch (err) {
      return {
        ok: false,
        releases: [],
        error: err instanceof Error ? err.message : 'Failed to fetch GitHub Releases',
      };
    }
  });

  ipcMain.handle('physiorecord:check-for-updates', async (event) => {
    assertTrustedIpcSender(event);
    const currentVersion = app.getVersion();
    try {
      const releasesList = await fetchGitHubReleasesList(OFFICIAL_GITHUB_REPO);
      const publishedReleases = releasesList.filter((r) => r && r.draft !== true);
      const release =
        publishedReleases.find((r) => !r.prerelease) || publishedReleases[0] || null;
      const latestTag = String(release?.tag_name || '').replace(/^v/i, '');
      const releaseUrl =
        String(release?.html_url || '') || `https://github.com/${OFFICIAL_GITHUB_REPO}/releases`;
      const assets = Array.isArray(release?.assets) ? release.assets : [];
      const exeAssets = assets.filter(
        (a) =>
          typeof a?.name === 'string' &&
          a.name.toLowerCase().endsWith('.exe') &&
          typeof a?.browser_download_url === 'string' &&
          a.browser_download_url.startsWith(`https://github.com/${OFFICIAL_GITHUB_REPO}/releases`)
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
}
