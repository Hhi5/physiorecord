#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Built-In Content & Visual Asset License Verifier (0.5)
// Fails CI if any SVG, binary asset, or built-in clinical dataset lacks
// a documented entry (source URL, author, license, date, reviewer).
// =======================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const MANIFEST_PATH = path.join(ROOT_DIR, 'CONTENT_LICENSES.md');

const BINARY_ASSET_EXTS = new Set([
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
]);

const EXPLICIT_CONTENT_MODULES = [
  'src/components/widgets/AnatomicalBodySvgs.tsx',
  'src/components/widgets/SpecialTestsWidget.tsx',
  'src/components/widgets/FunctionalScalesWidget.tsx',
  'src/components/clinic/ExerciseLibraryHepView.tsx',
  'src/utils/outcomeMeasures.ts',
  'src/utils/currencies.ts',
];

const FORBIDDEN_CONTENT_TERMS = [
  /Fair\s*Use/i,
  /All Rights Reserved/i,
  /Proprietary/i,
  /Non-?Commercial/i,
  /\bCC-BY-NC\b/i,
  /\bCC-BY-ND\b/i,
  /Preline/i,
];

function walkDir(dirRel, collected = []) {
  const full = path.join(ROOT_DIR, dirRel);
  if (!fs.existsSync(full)) return collected;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walkDir(rel, collected);
    } else {
      collected.push(rel);
    }
  }
  return collected;
}

function discoverRequiredFiles() {
  const required = new Set(EXPLICIT_CONTENT_MODULES);

  for (const dir of ['src', 'public']) {
    for (const rel of walkDir(dir)) {
      const ext = path.extname(rel).toLowerCase();
      if (BINARY_ASSET_EXTS.has(ext)) {
        required.add(rel);
        continue;
      }
      if (rel.startsWith('src/data/') && (ext === '.ts' || ext === '.tsx' || ext === '.json')) {
        required.add(rel);
        continue;
      }
      if (ext === '.tsx' || ext === '.ts') {
        const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
        if (/<svg[\s>]/i.test(content)) {
          required.add(rel);
        }
      }
    }
  }

  return Array.from(required).sort();
}

function parseManifestEntries(mdContent) {
  const entries = new Map();
  const lines = mdContent.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cols = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

    if (cols.length < 6) continue;
    const rawPath = cols[0].replace(/^`|`$/g, '');
    if (
      !rawPath ||
      rawPath === 'File / Asset Path' ||
      rawPath === 'Asset Package' ||
      /^---+$/.test(rawPath)
    ) {
      continue;
    }

    const [sourceUrl, author, license, date, reviewer] = cols.slice(1, 6);
    entries.set(rawPath, {
      filePath: rawPath,
      sourceUrl,
      author,
      license,
      date,
      reviewer,
    });
  }

  return entries;
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ CONTENT_LICENSES.md is missing.');
    process.exit(1);
  }

  const md = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const entries = parseManifestEntries(md);
  const requiredFiles = discoverRequiredFiles();

  const errors = [];

  for (const relPath of requiredFiles) {
    const entry = entries.get(relPath);
    if (!entry) {
      errors.push(`Missing CONTENT_LICENSES.md entry for asset/content file: ${relPath}`);
      continue;
    }

    if (!entry.sourceUrl || !entry.author || !entry.license || !entry.date || !entry.reviewer) {
      errors.push(`Incomplete metadata columns for ${relPath}`);
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      errors.push(`Invalid YYYY-MM-DD review date "${entry.date}" for ${relPath}`);
    }

    for (const pat of FORBIDDEN_CONTENT_TERMS) {
      if (pat.test(entry.license)) {
        errors.push(`Forbidden license term ${pat} in ${relPath}: "${entry.license}"`);
      }
    }
  }

  // Ensure no stale file paths remain in the file-path section
  for (const [key] of entries) {
    if (key.startsWith('src/') || key.startsWith('public/')) {
      if (!fs.existsSync(path.join(ROOT_DIR, key))) {
        errors.push(`Stale CONTENT_LICENSES.md entry (file not found on disk): ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`❌ Content License Check FAILED (${errors.length} error(s)):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(
    `✅ Content License Check PASSED: ${requiredFiles.length} built-in content & SVG/asset files verified in CONTENT_LICENSES.md.`
  );
}

main();
