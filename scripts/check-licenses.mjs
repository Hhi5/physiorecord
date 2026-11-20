#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Open-Source Dependency License Gate & Notices Generator
// Enforces R3 license policy over production + development dependencies.
// =======================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const NOTICES_PATH = path.join(ROOT_DIR, 'docs', 'legal', 'THIRD_PARTY_NOTICES.md');

const PROD_ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'OFL-1.1',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'Unlicense',
  'Public Domain',
]);

const DEV_ONLY_ALLOWED = new Set([
  ...PROD_ALLOWED,
  'MPL-2.0',
  'BlueOak-1.0.0',
]);

const FORBIDDEN_PATTERNS = [
  /Fair\s*Use/i,
  /-NC\b/i,
  /-ND\b/i,
  /Non-?Commercial/i,
  /Proprietary/i,
  /\bAGPL\b/i,
  /\bSSPL\b/i,
  /Preline/i,
];

function normalizePackageName(lockKey) {
  const idx = lockKey.lastIndexOf('node_modules/');
  return idx >= 0 ? lockKey.slice(idx + 'node_modules/'.length) : lockKey;
}

function readPackageMetadata(lockKey) {
  const pkgJsonPath = path.join(ROOT_DIR, lockKey, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    return {};
  }
}

function extractLicenseExpression(entry, diskMeta) {
  const raw = entry.license ?? diskMeta.license;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object' && typeof raw.type === 'string') {
    return raw.type.trim();
  }
  return 'UNKNOWN';
}

function tokenizeSpdx(expr) {
  return expr
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLicensePermitted(expr, isDev) {
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(expr)) return { ok: false, note: `Forbidden pattern ${pat}` };
  }

  const allowedSet = isDev ? DEV_ONLY_ALLOWED : PROD_ALLOWED;
  const parts = tokenizeSpdx(expr);

  if (parts.length === 0 || expr === 'UNKNOWN') {
    return { ok: false, note: 'Missing or unknown license' };
  }

  // Handle OR compound expressions (at least one branch allowed) vs single / AND
  if (/\s+OR\s+/i.test(expr) && !/\s+AND\s+/i.test(expr)) {
    const anyAllowed = parts.some((p) => allowedSet.has(p));
    return anyAllowed
      ? { ok: true, note: 'SPDX OR branch permitted' }
      : { ok: false, note: `No permitted branch in "${expr}"` };
  }

  const allAllowed = parts.every((p) => allowedSet.has(p));
  return allAllowed
    ? { ok: true }
    : {
        ok: false,
        note: `License "${expr}" not permitted for ${isDev ? 'dev' : 'production'} dependencies`,
      };
}

function formatAuthor(rawAuthor) {
  if (!rawAuthor) return 'Upstream Contributors';
  if (typeof rawAuthor === 'string') return rawAuthor.replace(/\|/g, '/').trim();
  if (typeof rawAuthor === 'object' && rawAuthor.name) {
    return String(rawAuthor.name).replace(/\|/g, '/').trim();
  }
  return 'Upstream Contributors';
}

function formatRepository(rawRepo) {
  if (!rawRepo) return '';
  const url = typeof rawRepo === 'string' ? rawRepo : rawRepo.url || '';
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
    .trim();
}

function buildNoticesMarkdown(records) {
  const prod = records.filter((r) => !r.isDev);
  const dev = records.filter((r) => r.isDev);

  const lines = [
    '# Third-Party Notices & Open-Source Software Inventory',
    '',
    'Generated automatically from `package-lock.json` via `npm run check:licenses -- --write-notices`.',
    '',
    '## Policy Summary',
    '- **Production Dependencies**: Permissive open-source & font licenses only (`MIT`, `ISC`, `BSD-*`, `Apache-2.0`, `OFL-1.1`, `0BSD`, `CC0-1.0`, `CC-BY-*`, `Unlicense`). Compatible with root `GPL-3.0-or-later`.',
    '- **Development & Build Tools**: Permits the same allowlist plus `MPL-2.0` (`lightningcss` via `@tailwindcss/vite`), with zero policy exceptions.',
    '',
    `## Production Runtime Dependencies (${prod.length})`,
    '',
    '| Package | Version | License | Author / Origin | Note |',
    '| --- | --- | --- | --- | --- |',
    ...prod.map(
      (r) =>
        `| \`${r.name}\` | \`${r.version}\` | \`${r.license}\` | ${r.author}${r.repo ? ` ([repo](${r.repo}))` : ''} | ${r.note || 'Permitted'} |`
    ),
    '',
    `## Development & Tooling Dependencies (${dev.length})`,
    '',
    '| Package | Version | License | Author / Origin | Note |',
    '| --- | --- | --- | --- | --- |',
    ...dev.map(
      (r) =>
        `| \`${r.name}\` | \`${r.version}\` | \`${r.license}\` | ${r.author}${r.repo ? ` ([repo](${r.repo}))` : ''} | ${r.note || 'Permitted'} |`
    ),
    '',
  ];

  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(LOCK_PATH) || !fs.existsSync(PKG_PATH)) {
    console.error('❌ Missing package.json or package-lock.json');
    process.exit(1);
  }

  const writeNotices = process.argv.includes('--write-notices');
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  const packages = lock.packages || {};

  const records = [];
  const violations = [];

  for (const [lockKey, entry] of Object.entries(packages)) {
    if (!lockKey) continue;
    const name = normalizePackageName(lockKey);
    const version = entry.version || 'unknown';
    const isDev = Boolean(entry.dev);
    const diskMeta = readPackageMetadata(lockKey);
    const license = extractLicenseExpression(entry, diskMeta);
    const check = isLicensePermitted(license, isDev);

    const record = {
      name,
      version,
      isDev,
      license,
      author: formatAuthor(diskMeta.author),
      repo: formatRepository(diskMeta.repository || diskMeta.homepage),
      note: check.note || '',
    };
    records.push(record);

    if (!check.ok) {
      violations.push({ ...record, reason: check.note });
    }
  }

  records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  if (writeNotices) {
    fs.writeFileSync(NOTICES_PATH, buildNoticesMarkdown(records), 'utf8');
    console.log(`📝 Wrote docs/legal/THIRD_PARTY_NOTICES.md (${records.length} packages)`);
  }

  if (violations.length > 0) {
    console.error(`❌ License Gate FAILED with ${violations.length} violation(s):`);
    for (const v of violations) {
      console.error(
        `  - ${v.name}@${v.version} [${v.isDev ? 'dev' : 'prod'}] license="${v.license}": ${v.reason}`
      );
    }
    process.exit(1);
  }

  const prodCount = records.filter((r) => !r.isDev).length;
  const devCount = records.filter((r) => r.isDev).length;
  console.log(
    `✅ License Gate PASSED: ${prodCount} production + ${devCount} development dependencies verified.`
  );
}

main();
