// =======================================================================
// PhysioRecord — Non-PHI Structured Diagnostic Utility
// Provides safe, redacted diagnostic recording for storage, migration,
// backup, and crypto fallbacks without ever logging PHI, passwords, or
// raw clinical/storage payloads.
// =======================================================================

export type DiagnosticLevel = 'warn' | 'error';

export interface SafeDiagnosticEntry {
  timestamp: string;
  level: DiagnosticLevel;
  scope: string;
  operation: string;
  errorName: string;
  errorCode?: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

const MAX_DIAGNOSTIC_RING_SIZE = 50;
const recentDiagnostics: SafeDiagnosticEntry[] = [];

/**
 * Masks dynamic IDs inside storage keys (e.g. patient-prefixed localStorage keys)
 * so only the structural key category is ever recorded.
 */
export function sanitizeStorageKeyName(key: string): string {
  const clean = String(key || '').trim();
  if (!clean) return '<empty>';

  const knownPrefixes = [
    'physiorecord_episode_clinical_v2_',
    'physiorecord_session_flowsheet_v2_latest_ep_',
    'physiorecord_session_flowsheet_v2_',
    'physiorecord_session_soap_v2_',
    'physiorecord_patient_widgets_',
    'physiorecord_organui_meds_',
  ];
  for (const prefix of knownPrefixes) {
    if (clean.startsWith(prefix)) {
      return `${prefix}<redacted-id>`;
    }
  }
  return clean.slice(0, 64);
}

/**
 * Redacts potential PHI (Arabic names, long digit/phone sequences, emails,
 * inline JSON objects/arrays, quoted payloads) from error messages.
 */
export function sanitizeDiagnosticMessage(rawMessage: unknown): string {
  if (typeof rawMessage !== 'string') return '';
  let sanitized = rawMessage.trim();
  if (!sanitized) return '';

  // Strip JSON-like payloads or bracketed structured content
  sanitized = sanitized
    .replace(/\{[\s\S]*\}/g, '{<redacted-object>}')
    .replace(/\[[\s\S]*\]/g, '[<redacted-array>]');

  // Strip quoted substrings which frequently echo malformed JSON tokens or values
  sanitized = sanitized
    .replace(/"[^"]{2,}"/g, '"<redacted>"')
    .replace(/'[^']{2,}'/g, "'<redacted>'");

  // Strip email addresses and long digit runs (phones, MRNs, timestamps/IDs)
  sanitized = sanitized
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<redacted-email>')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '<redacted-number>');

  // Strip Arabic script sequences from unexpected error messages so patient names
  // or Arabic clinical notes can never leak into console/diagnostic logs
  sanitized = sanitized.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+)*/g, '<redacted-text>');

  if (sanitized.length > 140) {
    sanitized = `${sanitized.slice(0, 137)}...`;
  }
  return sanitized;
}

export function extractSafeDiagnosticError(err: unknown): {
  errorName: string;
  errorCode?: string;
  summary: string;
} {
  if (err === null || err === undefined) {
    return { errorName: 'UnknownError', summary: '' };
  }
  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown };
    const errorCode =
      typeof withCode.code === 'string' || typeof withCode.code === 'number'
        ? String(withCode.code).slice(0, 32)
        : undefined;
    return {
      errorName: (err.name || 'Error').slice(0, 48),
      ...(errorCode ? { errorCode } : {}),
      summary: sanitizeDiagnosticMessage(err.message),
    };
  }
  if (typeof err === 'object') {
    const obj = err as { name?: unknown; code?: unknown; message?: unknown };
    const errorName =
      typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 48) : 'ObjectError';
    const errorCode =
      typeof obj.code === 'string' || typeof obj.code === 'number'
        ? String(obj.code).slice(0, 32)
        : undefined;
    const summary = typeof obj.message === 'string' ? sanitizeDiagnosticMessage(obj.message) : '';
    return { errorName, ...(errorCode ? { errorCode } : {}), summary };
  }
  return {
    errorName: typeof err,
    summary: sanitizeDiagnosticMessage(String(err)),
  };
}

function sanitizeSafeMeta(
  meta?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const clean: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [key, val] of Object.entries(meta)) {
    if (val === undefined) continue;
    if (typeof val === 'string') {
      clean[key] =
        key.toLowerCase().includes('key') ? sanitizeStorageKeyName(val) : sanitizeDiagnosticMessage(val);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    }
    count++;
  }
  return count > 0 ? clean : undefined;
}

/**
 * Records a non-PHI diagnostic warning into the capped in-memory ring buffer
 * and emits a sanitized `console.warn` line (never throwing).
 */
export function recordSafeNonFatalWarning(
  scope: string,
  operation: string,
  err?: unknown,
  safeMeta?: Record<string, string | number | boolean | undefined>
): SafeDiagnosticEntry {
  const extracted = extractSafeDiagnosticError(err);
  const sanitizedMeta = sanitizeSafeMeta(safeMeta);
  const entry: SafeDiagnosticEntry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    scope,
    operation,
    errorName: extracted.errorName,
    ...(extracted.errorCode ? { errorCode: extracted.errorCode } : {}),
    summary: extracted.summary,
    ...(sanitizedMeta ? { meta: sanitizedMeta } : {}),
  };

  recentDiagnostics.push(entry);
  if (recentDiagnostics.length > MAX_DIAGNOSTIC_RING_SIZE) {
    recentDiagnostics.shift();
  }

  try {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      const detail = entry.summary ? ` — ${entry.summary}` : '';
      const codeTag = entry.errorCode ? ` [${entry.errorCode}]` : '';
      console.warn(`[PhysioRecord:${scope}] ${operation} (${entry.errorName}${codeTag})${detail}`);
    }
  } catch {
    // Diagnostic logging must never throw into callers
  }

  return entry;
}

export function getRecentSafeDiagnostics(): ReadonlyArray<SafeDiagnosticEntry> {
  return [...recentDiagnostics];
}

export function clearRecentSafeDiagnostics(): void {
  recentDiagnostics.length = 0;
}
