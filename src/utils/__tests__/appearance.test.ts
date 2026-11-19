import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FONT_OPTIONS,
  DEFAULT_DISPLAY_PREFERENCES,
  clampFontScalePercent,
  getDisplayCssVariables,
  normalizeDisplayPreferences,
  resolveFontStack,
  sanitizeCssFontFamily,
} from '../appearancePrefs';
import {
  buildCustomCssFamily,
  sanitizeFontDisplayName,
  validateFontFileSignature,
} from '../customFonts';
import { ALLOWED_NON_PHI_LOCALSTORAGE_KEYS } from '../../services/localStorageMigrationService';

function makeHeaderBytes(bytes: number[], totalLen = 64): ArrayBuffer {
  const arr = new Uint8Array(totalLen);
  bytes.forEach((b, idx) => {
    arr[idx] = b;
  });
  return arr.buffer;
}

describe('Display, Typography & Custom Font Utilities', () => {
  it('registers display prefs key in ALLOWED_NON_PHI_LOCALSTORAGE_KEYS', () => {
    expect(ALLOWED_NON_PHI_LOCALSTORAGE_KEYS.has('physiorecord_display_prefs_v1')).toBe(true);
  });

  it('clamps fontScalePercent safely between 87.5 and 150 and migrates legacy scale', () => {
    expect(clampFontScalePercent(40)).toBe(87.5);
    expect(clampFontScalePercent(220)).toBe(150);
    expect(clampFontScalePercent(112.4)).toBe(112.5);

    const migrated = normalizeDisplayPreferences(undefined, '130');
    expect(migrated.fontScalePercent).toBe(130);
    expect(normalizeDisplayPreferences(null)).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it('never applies positive letter spacing to RTL Arabic/Kurdish variables and preserves built-in fallbacks', () => {
    const prefs = normalizeDisplayPreferences({
      fontPreset: 'custom:font_123',
      ltrLetterSpacing: 'wider',
      arabicScale: 1.12,
      lineHeight: 'relaxed',
      fontScalePercent: 120,
      contentMaxWidth: 'wide',
    });
    const vars = getDisplayCssVariables(prefs, 'PhysioCustomFont_font_123');
    expect(vars['--app-font-sans']).toContain('"PhysioCustomFont_font_123"');
    expect(vars['--app-font-sans']).toContain('"IBM Plex Sans Arabic"');
    expect(vars['--app-arabic-scale']).toBe('1.12');
    expect(vars['--app-line-height']).toBe('1.85');
    expect(vars['--app-ltr-letter-spacing']).toBe('0.03em');
    expect(vars['--app-max-width']).toBe('96rem');

    expect(BUILTIN_FONT_OPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(resolveFontStack('unknown_preset')).toContain('IBM Plex Sans Arabic');
    expect(sanitizeCssFontFamily('Noto<script>Sans;"')).toBe('NotoscriptSans');
  });

  it('validates font upload binary magic bytes (.woff2, .woff, .ttf, .otf) and enforces 5 MB cap', () => {
    const validWoff2 = makeHeaderBytes([0x77, 0x4f, 0x46, 0x32]);
    expect(validateFontFileSignature(validWoff2, 'Vazirmatn.woff2')).toEqual({
      valid: true,
      format: 'woff2',
    });

    const validWoff = makeHeaderBytes([0x77, 0x4f, 0x46, 0x46]);
    expect(validateFontFileSignature(validWoff, 'Cairo.woff')).toEqual({
      valid: true,
      format: 'woff',
    });

    const validTtf = makeHeaderBytes([0x00, 0x01, 0x00, 0x00]);
    expect(validateFontFileSignature(validTtf, 'Amiri.ttf')).toEqual({
      valid: true,
      format: 'ttf',
    });

    const validOtf = makeHeaderBytes([0x4f, 0x54, 0x54, 0x4f]);
    expect(validateFontFileSignature(validOtf, 'KurdishUI.otf')).toEqual({
      valid: true,
      format: 'otf',
    });

    const fakeExecutable = makeHeaderBytes([0x4d, 0x5a, 0x90, 0x00]);
    expect(validateFontFileSignature(fakeExecutable, 'evil.woff2').valid).toBe(false);

    const oversized = new ArrayBuffer(5 * 1024 * 1024 + 10);
    expect(validateFontFileSignature(oversized, 'huge.woff2').valid).toBe(false);

    expect(sanitizeFontDisplayName('My<Font> Name.woff2')).toBe('MyFont Name');
    expect(buildCustomCssFamily('font_abc-123')).toBe('PhysioCustomFont_font_abc-123');
  });
});
