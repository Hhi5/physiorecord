import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { resolveChromiumLaunchOptions } from './capture';
import type { CapturedStateResult, EvidenceManifest, MergedStateEntry } from './types';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toDataUri(filePath?: string): string | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function formatAxeShort(res: CapturedStateResult): string {
  if (res.status !== 'captured' || !res.axe) {
    return '—';
  }
  return `${res.axe.violationCount} (${res.axe.totalAffectedNodes} nodes)`;
}

function formatAxeImpactDetail(res: CapturedStateResult): string {
  if (res.status !== 'captured' || !res.axe) {
    return res.reason || 'NOT CAPTURED';
  }
  const { byImpact, rules } = res.axe;
  const topRules = rules
    .slice(0, 4)
    .map((r) => `${r.id} (${r.impact}: ${r.nodes})`)
    .join(', ');
  return `crit:${byImpact.critical} ser:${byImpact.serious} mod:${byImpact.moderate} min:${byImpact.minor} | overflow:${res.horizontalOverflowPx ?? 0}px${
    topRules ? ` | rules: ${topRules}` : ''
  }`;
}

function renderSidePanel(
  label: string,
  refLabel: string,
  res: CapturedStateResult
): string {
  const imgUri = res.status === 'captured' ? toDataUri(res.screenshotPath) : null;
  if (imgUri) {
    return `
      <div class="panel">
        <div class="panel-header">
          <span class="badge badge-${label.toLowerCase()}">${escapeHtml(label)}</span>
          <span class="ref-text">${escapeHtml(refLabel)}</span>
        </div>
        <div class="frame">
          <img src="${imgUri}" alt="${escapeHtml(label)} screenshot" />
        </div>
        <div class="panel-meta">
          ${escapeHtml(formatAxeImpactDetail(res))}
        </div>
      </div>
    `;
  }

  const reason = res.reason || 'NOT CAPTURED: Unavailable';
  return `
    <div class="panel">
      <div class="panel-header">
        <span class="badge badge-${label.toLowerCase()}">${escapeHtml(label)}</span>
        <span class="ref-text">${escapeHtml(refLabel)}</span>
      </div>
      <div class="frame not-captured-box">
        <div class="not-captured-label">NOT CAPTURED</div>
        <div class="not-captured-reason">${escapeHtml(reason.replace(/^NOT CAPTURED:\s*/i, ''))}</div>
      </div>
      <div class="panel-meta">Axe: N/A</div>
    </div>
  `;
}

function renderComparisonPage(
  entry: MergedStateEntry,
  index: number,
  total: number,
  manifest: EvidenceManifest
): string {
  const beforeCount =
    entry.before.status === 'captured' && entry.before.axe
      ? String(entry.before.axe.violationCount)
      : 'N/A';
  const afterCount =
    entry.after.status === 'captured' && entry.after.axe
      ? String(entry.after.axe.violationCount)
      : 'N/A';

  const beforeNodes =
    entry.before.status === 'captured' && entry.before.axe
      ? ` (${entry.before.axe.totalAffectedNodes} nodes)`
      : '';
  const afterNodes =
    entry.after.status === 'captured' && entry.after.axe
      ? ` (${entry.after.axe.totalAffectedNodes} nodes)`
      : '';

  return `
    <section class="page comparison-page">
      <header class="page-head">
        <div>
          <h1 class="page-title">${escapeHtml(entry.spec.title)}</h1>
          <div class="page-sub">
            State #${index + 1}/${total} · ID: <code>${escapeHtml(entry.spec.id)}</code> · Viewport ${manifest.viewport.width}×${manifest.viewport.height} (DPR ${manifest.viewport.deviceScaleFactor}, touch) · Arabic RTL
          </div>
        </div>
        <div class="axe-pill">
          Axe Violations: <strong>${escapeHtml(beforeCount)}${escapeHtml(beforeNodes)}</strong> → <strong>${escapeHtml(afterCount)}${escapeHtml(afterNodes)}</strong>
        </div>
      </header>

      <div class="panels-row">
        ${renderSidePanel('BEFORE', manifest.beforeRefLabel, entry.before)}
        ${renderSidePanel('AFTER', manifest.afterRefLabel, entry.after)}
      </div>

      <footer class="page-foot">
        <span>Axe-Core Violations (Before → After): <strong>${escapeHtml(beforeCount)} → ${escapeHtml(afterCount)}</strong></span>
        <span>${escapeHtml(entry.spec.category)}</span>
      </footer>
    </section>
  `;
}

function renderSummaryPages(manifest: EvidenceManifest): string {
  const totalStates = manifest.entries.length;
  const beforeCaptured = manifest.entries.filter((e) => e.before.status === 'captured').length;
  const afterCaptured = manifest.entries.filter((e) => e.after.status === 'captured').length;
  const afterTotalViolations = manifest.entries.reduce(
    (sum, e) => sum + (e.after.axe?.violationCount ?? 0),
    0
  );
  const beforeTotalViolations =
    beforeCaptured > 0
      ? String(
          manifest.entries.reduce((sum, e) => sum + (e.before.axe?.violationCount ?? 0), 0)
        )
      : 'N/A';

  const rowsHtml = manifest.entries
    .map((entry, idx) => {
      const bStr =
        entry.before.status === 'captured'
          ? formatAxeShort(entry.before)
          : entry.before.reason || 'NOT CAPTURED';
      const aStr =
        entry.after.status === 'captured'
          ? formatAxeShort(entry.after)
          : entry.after.reason || 'NOT CAPTURED';
      const arrow = `${entry.before.axe?.violationCount ?? 'N/A'} → ${
        entry.after.axe?.violationCount ?? 'N/A'
      }`;
      const overflowAfter =
        entry.after.status === 'captured' ? `${entry.after.horizontalOverflowPx ?? 0}px` : '—';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(entry.spec.title)}</td>
          <td>${escapeHtml(bStr)}</td>
          <td>${escapeHtml(aStr)}</td>
          <td class="mono">${escapeHtml(arrow)}</td>
          <td class="mono">${escapeHtml(overflowAfter)}</td>
        </tr>
      `;
    })
    .join('\n');

  return `
    <section class="page summary-page">
      <header class="page-head">
        <div>
          <h1 class="page-title">UX &amp; Accessibility Verification Summary Table</h1>
          <div class="page-sub">
            Generated ${escapeHtml(manifest.generatedAt)} · BEFORE: ${escapeHtml(manifest.beforeRefLabel)} · AFTER: ${escapeHtml(manifest.afterRefLabel)}
          </div>
        </div>
        <div class="axe-pill">
          Captured: Before ${beforeCaptured}/${totalStates} · After ${afterCaptured}/${totalStates} · Violations: ${beforeTotalViolations} → ${afterTotalViolations}
        </div>
      </header>
      ${
        manifest.beforeUnavailableReason
          ? `<div class="banner-warn"><strong>BEFORE NOT CAPTURED:</strong> ${escapeHtml(
              manifest.beforeUnavailableReason
            )}</div>`
          : ''
      }
      <table class="summary-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Screen · Theme · Mode</th>
            <th>Before (Status / Axe)</th>
            <th>After (Status / Axe)</th>
            <th>Axe (Before → After)</th>
            <th>After Overflow</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;
}

export function buildReportHtml(manifest: EvidenceManifest): string {
  const pages = manifest.entries
    .map((entry, idx) => renderComparisonPage(entry, idx, manifest.entries.length, manifest))
    .join('\n');
  const summary = renderSummaryPages(manifest);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PhysioRecord UX Visual & Accessibility Evidence Report</title>
  <style>
    * { box-sizing: border-box; }
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .page {
      width: 100%;
      page-break-after: always;
      break-after: page;
    }
    .comparison-page {
      height: 192mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .summary-page {
      page-break-after: auto;
      break-after: auto;
    }
    .page-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .page-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .page-sub {
      margin-top: 2px;
      font-size: 10px;
      color: #475569;
    }
    .axe-pill {
      font-size: 11px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      white-space: nowrap;
    }
    .panels-row {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      min-height: 0;
    }
    .panel {
      display: flex;
      flex-direction: column;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px;
      background: #f8fafc;
      min-height: 0;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 10px;
    }
    .badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10px;
    }
    .badge-before { background: #fee2e2; color: #991b1b; }
    .badge-after { background: #dcfce7; color: #166534; }
    .ref-text {
      color: #475569;
      font-family: monospace;
      font-size: 9px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 75%;
    }
    .frame {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      min-height: 0;
    }
    .frame img {
      max-width: 100%;
      max-height: 146mm;
      object-fit: contain;
      display: block;
    }
    .not-captured-box {
      flex-direction: column;
      padding: 16px;
      text-align: center;
      background: #fff7ed;
      border: 1px dashed #fb923c;
    }
    .not-captured-label {
      font-size: 13px;
      font-weight: 700;
      color: #c2410c;
      margin-bottom: 6px;
    }
    .not-captured-reason {
      font-size: 10px;
      color: #7c2d12;
      max-width: 90%;
      line-height: 1.4;
    }
    .panel-meta {
      margin-top: 4px;
      font-size: 9px;
      color: #334155;
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .page-foot {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #334155;
    }
    .banner-warn {
      margin-bottom: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: #fff7ed;
      border: 1px solid #fb923c;
      color: #9a3412;
      font-size: 10px;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    .summary-table th, .summary-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    .summary-table th {
      background: #f1f5f9;
      font-weight: 700;
    }
    .summary-table tr { break-inside: avoid; }
    .mono { font-family: monospace; white-space: nowrap; }
  </style>
</head>
<body>
  ${pages}
  ${summary}
</body>
</html>`;
}

export async function generatePdfReport(
  manifest: EvidenceManifest,
  outputPdfPath: string
): Promise<void> {
  const html = buildReportHtml(manifest);
  const outDir = path.dirname(outputPdfPath);
  fs.mkdirSync(outDir, { recursive: true });
  const htmlDebugPath = path.join(outDir, 'report.html');
  fs.writeFileSync(htmlDebugPath, html, 'utf-8');

  const launchOpts = resolveChromiumLaunchOptions();
  const browser = await chromium.launch(launchOpts);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '8mm',
        right: '8mm',
        bottom: '8mm',
        left: '8mm',
      },
    });
    await context.close();
  } finally {
    await browser.close();
  }
}
