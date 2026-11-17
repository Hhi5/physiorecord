import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const zipPath = 'C:\\Users\\alrmd\\AppData\\Local\\electron\\Cache\\30492332c387d104f1870a849263c2c8ead3381ecaf9127c99af0ed108df75a5\\electron-v45.3.3-win32-x64.zip';
const outDir = path.join(rootDir, 'release', 'PhysioRecord-Windows-x64');

console.log('[package-exe] Preparing directory:', outDir);
fs.mkdirSync(outDir, { recursive: true });

console.log('[package-exe] Extracting electron binary from:', zipPath);
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force`]);

const electronExe = path.join(outDir, 'electron.exe');
const physioExe = path.join(outDir, 'PhysioRecord.exe');
if (fs.existsSync(electronExe)) {
  if (fs.existsSync(physioExe)) fs.unlinkSync(physioExe);
  fs.renameSync(electronExe, physioExe);
  console.log('[package-exe] Renamed electron.exe -> PhysioRecord.exe');
}

const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// Copy package.json, dist, electron
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(appDir, 'package.json'));
if (fs.existsSync(path.join(rootDir, 'LICENSE'))) {
  fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(appDir, 'LICENSE'));
}

fs.cpSync(path.join(rootDir, 'dist'), path.join(appDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'electron'), path.join(appDir, 'electron'), { recursive: true });

console.log('[package-exe] App bundled successfully into resources/app');

// Also create a zip of the portable version for easy distribution
const zipDest = path.join(rootDir, 'release', 'PhysioRecord-v1.0.0-Windows-x64.zip');
console.log('[package-exe] Creating release zip:', zipDest);
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipDest}' -Force`]);

console.log('[package-exe] ✅ Successfully created PhysioRecord.exe and portable zip in release/');
