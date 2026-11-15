import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { captureSideEvidence, MOBILE_VIEWPORT } from './capture';
import { generatePdfReport } from './pdfReport';
import { ORDERED_STATE_SPECS } from './states';
import type {
  CapturedStateResult,
  EvidenceManifest,
  SideRunResult,
} from './types';

interface CliOptions {
  beforeRef?: string;
  afterOnly: boolean;
  skipBuild: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    beforeRef: process.env.UX_EVIDENCE_BEFORE_REF || undefined,
    afterOnly: false,
    skipBuild: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--after-only') {
      opts.afterOnly = true;
    } else if (arg === '--skip-build') {
      opts.skipBuild = true;
    } else if (arg === '--before-ref' && argv[i + 1]) {
      opts.beforeRef = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--before-ref=')) {
      opts.beforeRef = arg.slice('--before-ref='.length);
    }
  }
  return opts;
}

function execGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isGitRepo(cwd: string): boolean {
  try {
    return execGit(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    return false;
  }
}

function runSyncCommand(cmd: string, args: string[], cwd: string): void {
  execFileSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
}

async function waitForHttpReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 400);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not become ready at ${url} within ${timeoutMs}ms`);
}

function startPreviewServer(cwd: string, port: number): ChildProcess {
  const viteBin = path.join(cwd, 'node_modules', '.bin', 'vite');
  const cmd = fs.existsSync(viteBin) ? viteBin : 'npx';
  const args = fs.existsSync(viteBin)
    ? ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
    : ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];

  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(`[preview:${port}] ${text}`);
  });

  return child;
}

async function stopPreviewServer(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.killed) return;
  proc.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
      resolve();
    }, 3000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function makeUnavailableSideResult(
  side: 'before' | 'after',
  refLabel: string,
  reason: string
): SideRunResult {
  const normalizedReason = reason.startsWith('NOT CAPTURED:')
    ? reason
    : `NOT CAPTURED: ${reason}`;
  const states: Record<string, CapturedStateResult> = {};
  for (const spec of ORDERED_STATE_SPECS) {
    states[spec.id] = {
      spec,
      status: 'not_captured',
      reason: normalizedReason,
    };
  }
  return {
    side,
    refLabel,
    baseUrl: '',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    unavailableReason: normalizedReason,
    states,
  };
}

function filesIdentical(aPath: string, bPath: string): boolean {
  if (!fs.existsSync(aPath) || !fs.existsSync(bPath)) return false;
  return fs.readFileSync(aPath).equals(fs.readFileSync(bPath));
}

async function runBeforeWorktree(
  repoRoot: string,
  beforeRef: string,
  screenshotsDir: string
): Promise<SideRunResult> {
  const resolvedSha = execGit(repoRoot, ['rev-parse', '--verify', beforeRef]);
  const shortSha = execGit(repoRoot, ['rev-parse', '--short', resolvedSha]);
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'physiorecord-ux-before-'));
  let previewProc: ChildProcess | null = null;

  try {
    console.log(`[before] Checking out git worktree ${shortSha} (${beforeRef}) at ${worktreeDir}`);
    execGit(repoRoot, ['worktree', 'add', '--detach', worktreeDir, resolvedSha]);

    const rootLock = path.join(repoRoot, 'package-lock.json');
    const wtLock = path.join(worktreeDir, 'package-lock.json');
    const rootModules = path.join(repoRoot, 'node_modules');
    const wtModules = path.join(worktreeDir, 'node_modules');

    if (fs.existsSync(rootModules) && filesIdentical(rootLock, wtLock)) {
      fs.symlinkSync(rootModules, wtModules, 'dir');
      console.log('[before] Reused root node_modules via symlink (package-lock.json unchanged).');
    } else {
      console.log('[before] Installing dependencies in BEFORE worktree...');
      runSyncCommand('npm', ['ci'], worktreeDir);
    }

    console.log('[before] Building BEFORE worktree...');
    runSyncCommand('npm', ['run', 'build'], worktreeDir);

    const beforePort = 4175;
    const baseUrl = `http://127.0.0.1:${beforePort}`;
    previewProc = startPreviewServer(worktreeDir, beforePort);
    await waitForHttpReady(baseUrl);

    return await captureSideEvidence({
      side: 'before',
      refLabel: `${beforeRef} (${shortSha})`,
      baseUrl,
      screenshotsDir,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[before] Worktree capture failed: ${msg}`);
    return makeUnavailableSideResult(
      'before',
      beforeRef,
      `Failed to build/capture BEFORE worktree (${beforeRef}): ${msg}`
    );
  } finally {
    await stopPreviewServer(previewProc);
    try {
      execGit(repoRoot, ['worktree', 'remove', '--force', worktreeDir]);
    } catch {
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
  }
}

async function runAfterWorkingTree(
  repoRoot: string,
  screenshotsDir: string,
  skipBuild: boolean,
  refLabel: string
): Promise<SideRunResult> {
  let previewProc: ChildProcess | null = null;
  try {
    if (!skipBuild) {
      console.log('[after] Building AFTER working tree...');
      runSyncCommand('npm', ['run', 'build'], repoRoot);
    }
    const afterPort = 4174;
    const baseUrl = `http://127.0.0.1:${afterPort}`;
    previewProc = startPreviewServer(repoRoot, afterPort);
    await waitForHttpReady(baseUrl);

    return await captureSideEvidence({
      side: 'after',
      refLabel,
      baseUrl,
      screenshotsDir,
    });
  } finally {
    await stopPreviewServer(previewProc);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const outRoot = path.join(repoRoot, 'ux-evidence');
  const screenshotsDir = path.join(outRoot, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const hasGit = isGitRepo(repoRoot);
  let afterRefLabel = 'working-tree';
  if (hasGit) {
    try {
      const sha = execGit(repoRoot, ['rev-parse', '--short', 'HEAD']);
      afterRefLabel = `working-tree (${sha})`;
    } catch {
      afterRefLabel = 'working-tree';
    }
  }

  let beforeResult: SideRunResult;
  if (opts.afterOnly) {
    beforeResult = makeUnavailableSideResult(
      'before',
      opts.beforeRef || 'skipped',
      'BEFORE skipped (--after-only flag provided).'
    );
  } else if (!hasGit) {
    beforeResult = makeUnavailableSideResult(
      'before',
      opts.beforeRef || 'unavailable (no .git)',
      'Workspace is not a git repository (no commit history available for git worktree checkout). Run locally in git clone with --before-ref <commit-before-first-fix>.'
    );
  } else {
    const candidateRef = opts.beforeRef || 'HEAD~1';
    beforeResult = await runBeforeWorktree(repoRoot, candidateRef, screenshotsDir);
  }

  const afterResult = await runAfterWorkingTree(
    repoRoot,
    screenshotsDir,
    opts.skipBuild,
    afterRefLabel
  );

  const manifest: EvidenceManifest = {
    generatedAt: new Date().toISOString(),
    viewport: { ...MOBILE_VIEWPORT },
    language: 'ar',
    beforeRefLabel: beforeResult.refLabel,
    afterRefLabel: afterResult.refLabel,
    beforeUnavailableReason: beforeResult.unavailableReason,
    entries: ORDERED_STATE_SPECS.map((spec) => ({
      spec,
      before:
        beforeResult.states[spec.id] ?? {
          spec,
          status: 'not_captured',
          reason: 'NOT CAPTURED: Missing from BEFORE run',
        },
      after:
        afterResult.states[spec.id] ?? {
          spec,
          status: 'not_captured',
          reason: 'NOT CAPTURED: Missing from AFTER run',
        },
    })),
  };

  const resultsJsonPath = path.join(outRoot, 'results.json');
  fs.writeFileSync(resultsJsonPath, JSON.stringify(manifest, null, 2), 'utf-8');

  const pdfPath = path.join(outRoot, 'report.pdf');
  console.log(`[report] Building PDF at ${pdfPath}...`);
  await generatePdfReport(manifest, pdfPath);

  const afterCaptured = manifest.entries.filter((e) => e.after.status === 'captured').length;
  const beforeCaptured = manifest.entries.filter((e) => e.before.status === 'captured').length;
  console.log(
    `[done] PDF generated at ${pdfPath} | Before: ${beforeCaptured}/${manifest.entries.length} | After: ${afterCaptured}/${manifest.entries.length}`
  );
}

main().catch((err) => {
  console.error('Fatal error running UX evidence pipeline:', err);
  process.exit(1);
});
