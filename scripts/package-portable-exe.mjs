import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.0.0').trim();
const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const zipPath = process.env.ELECTRON_WIN_ZIP || '';
const outDir = path.join(rootDir, 'release', 'PhysioRecord-Windows-x64');

console.log('[package-exe] Preparing directory:', outDir);
fs.mkdirSync(outDir, { recursive: true });

if (zipPath && fs.existsSync(zipPath)) {
  console.log('[package-exe] Extracting electron binary from:', zipPath);
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force`,
  ]);
} else if (fs.existsSync(electronDistDir)) {
  console.log('[package-exe] Copying electron runtime from:', electronDistDir);
  fs.cpSync(electronDistDir, outDir, { recursive: true });
} else {
  throw new Error(
    'Electron runtime not found. Install electron (`npm install --no-save electron@34.3.0`) or set ELECTRON_WIN_ZIP.'
  );
}

const electronExe = path.join(outDir, 'electron.exe');
const physioExe = path.join(outDir, 'PhysioRecord.exe');
if (fs.existsSync(electronExe)) {
  if (fs.existsSync(physioExe)) fs.unlinkSync(physioExe);
  fs.renameSync(electronExe, physioExe);
  console.log('[package-exe] Renamed electron.exe -> PhysioRecord.exe');
}

const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// Copy package.json, license notices, dist, electron
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(appDir, 'package.json'));
for (const doc of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'CONTENT_LICENSES.md']) {
  const src = path.join(rootDir, doc);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(appDir, doc));
  }
}

fs.cpSync(path.join(rootDir, 'dist'), path.join(appDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'electron'), path.join(appDir, 'electron'), { recursive: true });

console.log('[package-exe] App bundled successfully into resources/app');

// Also create a zip of the portable folder for easy distribution
const zipDest = path.join(rootDir, 'release', `PhysioRecord-v${version}-Windows-x64.zip`);
console.log('[package-exe] Creating release zip:', zipDest);
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipDest}' -Force`,
]);

console.log('[package-exe] ✅ Successfully created PhysioRecord.exe and portable zip in release/');
