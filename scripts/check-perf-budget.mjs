#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Performance & Bundle Split Budget Checker (Phase A3)
// Validates built dist/index.html + dist/assets/* against
// docs/PERFORMANCE_BUDGET.json so lazy routes/widgets stay split and
// initial entry JS/CSS payload fits low-end clinics' hardware budgets.
// =======================================================================

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const BUDGET_FILE = path.join(ROOT_DIR, 'docs', 'PERFORMANCE_BUDGET.json');

function fail(message) {
  console.error(`\n[check:perf] FAIL: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(BUDGET_FILE)) {
  fail(`Missing budget file: ${BUDGET_FILE}`);
}

if (!fs.existsSync(INDEX_HTML) || !fs.existsSync(ASSETS_DIR)) {
  fail('Missing dist build output. Run `npm run build` before `npm run check:perf`.');
}

const config = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
const budgets = config.budgets || {};
const requiredPrefixes = config.requiredLazyChunkPrefixes || [];

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const entryScripts = [...html.matchAll(/src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const preloadScripts = [...html.matchAll(/href="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const entryStyles = [...html.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map((m) => m[1]);

if (entryScripts.length === 0) {
  fail('Could not detect any entry JS <script src="/assets/..."> tag in dist/index.html.');
}

const statAsset = (file) => {
  const safeBaseName = path.basename(String(file || ''));
  const fullPath = path.resolve(ASSETS_DIR, safeBaseName);
  if (!fullPath.startsWith(ASSETS_DIR + path.sep) || !fs.existsSync(fullPath)) {
    fail(`Asset referenced in dist/index.html is missing on disk: ${file}`);
  }
  const buf = fs.readFileSync(fullPath);
  const gzBytes = zlib.gzipSync(buf, { level: 9 }).length;
  return { file: safeBaseName, rawBytes: buf.length, gzBytes };
};

const entryJsStats = entryScripts.map(statAsset);
const preloadJsStats = preloadScripts.map(statAsset);
const entryCssStats = entryStyles.map(statAsset);

const entryJsGz = entryJsStats.reduce((sum, item) => sum + item.gzBytes, 0);
const initialJsGz = entryJsGz + preloadJsStats.reduce((sum, item) => sum + item.gzBytes, 0);
const entryCssGz = entryCssStats.reduce((sum, item) => sum + item.gzBytes, 0);

const initialSet = new Set([...entryScripts, ...preloadScripts]);
const allJsAssets = fs.readdirSync(ASSETS_DIR).filter((name) => name.endsWith('.js'));
const lazyJsAssets = allJsAssets.filter((name) => !initialSet.has(name));

const violations = [];

if (entryJsGz > budgets.maxEntryJsGzipBytes) {
  violations.push(
    `Entry JS gzip size ${entryJsGz} B exceeds budget ${budgets.maxEntryJsGzipBytes} B (${entryScripts.join(', ')})`
  );
}

if (initialJsGz > budgets.maxInitialJsGzipBytes) {
  violations.push(
    `Initial entry+modulepreload JS gzip size ${initialJsGz} B exceeds budget ${budgets.maxInitialJsGzipBytes} B`
  );
}

if (entryCssGz > budgets.maxEntryCssGzipBytes) {
  violations.push(
    `Entry CSS gzip size ${entryCssGz} B exceeds budget ${budgets.maxEntryCssGzipBytes} B`
  );
}

for (const jsFile of allJsAssets) {
  const rawBytes = fs.statSync(path.join(ASSETS_DIR, jsFile)).size;
  if (rawBytes > budgets.maxSingleJsChunkRawBytes) {
    violations.push(
      `Chunk ${jsFile} raw size ${rawBytes} B exceeds maxSingleJsChunkRawBytes (${budgets.maxSingleJsChunkRawBytes} B)`
    );
  }
}

if (lazyJsAssets.length < budgets.minLazyJsChunkCount) {
  violations.push(
    `Lazy JS chunk count ${lazyJsAssets.length} is below minLazyJsChunkCount (${budgets.minLazyJsChunkCount})`
  );
}

for (const prefix of requiredPrefixes) {
  const matched = lazyJsAssets.some((file) => file.startsWith(prefix));
  if (!matched) {
    violations.push(`Expected split lazy chunk starting with "${prefix}" was not emitted.`);
  }
}

console.log('[check:perf] Built bundle metrics:');
console.log(`  - Entry JS gzipped:      ${entryJsGz} B / ${budgets.maxEntryJsGzipBytes} B`);
console.log(`  - Initial JS gzipped:    ${initialJsGz} B / ${budgets.maxInitialJsGzipBytes} B`);
console.log(`  - Entry CSS gzipped:     ${entryCssGz} B / ${budgets.maxEntryCssGzipBytes} B`);
console.log(`  - Total / Lazy JS chunks: ${allJsAssets.length} / ${lazyJsAssets.length} (min lazy: ${budgets.minLazyJsChunkCount})`);

if (violations.length > 0) {
  for (const v of violations) {
    console.error(`[check:perf] VIOLATION: ${v}`);
  }
  process.exit(1);
}

console.log('[check:perf] PASS: All bundle size & code-splitting budgets satisfied.');
