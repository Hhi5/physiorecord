#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Cross-Platform Vite Build Target Runner (Linux / macOS / Windows)
// Eliminates POSIX-only `VITE_APP_TARGET=...` inline env syntax in package.json
// so builds succeed identically in bash, zsh, PowerShell, and Windows cmd.exe.
// =======================================================================

import { build } from 'vite';
import { syncAndroidVersion } from './sync-version.mjs';

const rawTarget = (process.argv[2] || process.env.VITE_APP_TARGET || 'web').trim().toLowerCase();
const allowedTargets = new Set(['web', 'android', 'ios', 'desktop']);
const target = allowedTargets.has(rawTarget) ? rawTarget : 'web';

process.env.VITE_APP_TARGET = target;

if (target === 'android' || target === 'desktop') {
  syncAndroidVersion();
}

console.log(`[build-target] Building PhysioRecord for target: ${target}`);
await build();
