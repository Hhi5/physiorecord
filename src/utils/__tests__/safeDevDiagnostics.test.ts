import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentSafeDiagnostics,
  extractSafeDiagnosticError,
  getRecentSafeDiagnostics,
  recordSafeNonFatalWarning,
  sanitizeDiagnosticMessage,
  sanitizeStorageKeyName,
} from '../safeDevDiagnostics';

describe('safeDevDiagnostics', () => {
  beforeEach(() => {
    clearRecentSafeDiagnostics();
  });

  it('redacts Arabic text, phone numbers, emails, and inline JSON payloads from messages', () => {
    const dirty =
      'Failed parsing JSON for أحمد كريم +9647701234567 ahmad@clinic.iq with {"fullName":"أحمد كريم","phone":"07701234567"}';
    const cleaned = sanitizeDiagnosticMessage(dirty);

    expect(cleaned).not.toContain('أحمد');
    expect(cleaned).not.toContain('07701234567');
    expect(cleaned).not.toContain('ahmad@clinic.iq');
    expect(cleaned).not.toContain('fullName');
    expect(cleaned).toContain('<redacted-text>');
    expect(cleaned).toContain('<redacted-email>');
    expect(cleaned).toContain('{<redacted-object>}');
  });

  it('masks dynamic IDs on patient-scoped storage keys while keeping structural key names', () => {
    expect(sanitizeStorageKeyName('physiorecord_organui_meds_pat_12345')).toBe(
      'physiorecord_organui_meds_<redacted-id>'
    );
    expect(sanitizeStorageKeyName('physiorecord_session_flowsheet_v2_latest_ep_ep99')).toBe(
      'physiorecord_session_flowsheet_v2_latest_ep_<redacted-id>'
    );
    expect(sanitizeStorageKeyName('physiorecord_mrn_seq_v1')).toBe('physiorecord_mrn_seq_v1');
  });

  it('extracts structured error fields and caps diagnostic ring buffer size', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const err = new Error('Unexpected token at position 0 in {"secret":"value"}');
      err.name = 'SyntaxError';
      const extracted = extractSafeDiagnosticError(err);
      expect(extracted.errorName).toBe('SyntaxError');
      expect(extracted.summary).not.toContain('secret');

      for (let i = 0; i < 60; i++) {
        recordSafeNonFatalWarning('migration', `step_${i}`, err, {
          storageKey: 'physiorecord_organui_meds_p1',
        });
      }

      const history = getRecentSafeDiagnostics();
      expect(history.length).toBe(50);
      expect(history[0].operation).toBe('step_10');
      expect(history[history.length - 1].meta?.storageKey).toBe(
        'physiorecord_organui_meds_<redacted-id>'
      );
      expect(warnSpy).toHaveBeenCalledTimes(60);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
