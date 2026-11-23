import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentSafeDiagnostics,
  extractSafeDiagnosticError,
  getRecentSafeDiagnostics,
  recordSafeNonFatalWarning,
  sanitizeDiagnosticMessage,
  sanitizeStorageKeyName,
} from '../safeDevDiagnostics';
import {
  getValidatedLanCorsOrigin,
  isAllowedExternalActionUrl,
  isPrivateLanSyncUrl,
  isSafeSyncDeviceId,
  isValidGoogleDriveId,
  randomHexCsprng,
  safeJsonParse,
  sanitizeExportedDocumentHtml,
} from '../securityHardening';
import {
  PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
  decryptSyncEnvelope,
  encryptSyncEnvelope,
  type ClinicSyncPayload,
} from '../clinicSyncEngine';
import {
  buildShareableDocumentHtmlFile,
  buildShareableDocumentHtmlString,
  renderAnnotatedPhotoDataUrl,
} from '../sharingInteropPhaseE';
import { buildMinimalXlsxBuffer, parseXlsxBufferToMatrix } from '../dataQualityPhaseD';
import { isSafeAttachmentDataUrl, processAttachmentFile } from '../attachmentMedia';
import {
  getNativeGoogleOAuthConfig,
  saveNativeGoogleOAuthConfig,
  signOutGoogleDrive,
} from '../../services/googleDriveSync';

describe('Security Hardening — SSRF & Private LAN Sync URL Validation', () => {
  it('allows valid RFC1918, loopback, and .local LAN Hub URLs', () => {
    expect(isPrivateLanSyncUrl('http://192.168.1.15:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://10.0.0.5:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://172.16.4.20:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://172.31.255.1:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://127.0.0.1:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://localhost:47821')).toBe(true);
    expect(isPrivateLanSyncUrl('http://clinic-pc.local:47821')).toBe(true);
  });

  it('blocks public internet hosts, cloud metadata IPs, userinfo, and non-HTTP schemes', () => {
    expect(isPrivateLanSyncUrl('http://169.254.169.254')).toBe(false);
    expect(isPrivateLanSyncUrl('http://169.254.169.254:80')).toBe(false);
    expect(isPrivateLanSyncUrl('https://evil.example.com')).toBe(false);
    expect(isPrivateLanSyncUrl('http://8.8.8.8:47821')).toBe(false);
    expect(isPrivateLanSyncUrl('http://172.32.0.1:47821')).toBe(false);
    expect(isPrivateLanSyncUrl('http://010.0.0.1:47821')).toBe(false);
    expect(isPrivateLanSyncUrl('http://user:pass@192.168.1.15:47821')).toBe(false);
    expect(isPrivateLanSyncUrl('http://192.168.1.15:47821/evil')).toBe(false);
    expect(isPrivateLanSyncUrl('javascript:alert(1)')).toBe(false);
    expect(isPrivateLanSyncUrl('file:///etc/passwd')).toBe(false);
  });

  it('canonicalizes allowed LAN CORS origins and rejects untrusted *.pages.dev subdomains and external origins', () => {
    expect(getValidatedLanCorsOrigin('app://bundle')).toBe('app://bundle');
    expect(getValidatedLanCorsOrigin('capacitor://localhost')).toBe('capacitor://localhost');
    expect(getValidatedLanCorsOrigin('https://physiorecord.pages.dev')).toBe(
      'https://physiorecord.pages.dev'
    );
    expect(getValidatedLanCorsOrigin('http://192.168.1.25:3000')).toBe('http://192.168.1.25:3000');
    expect(getValidatedLanCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173');

    // Reject untrusted sibling Cloudflare Pages tenants and external domains
    expect(getValidatedLanCorsOrigin('https://attacker.pages.dev')).toBeNull();
    expect(getValidatedLanCorsOrigin('https://pages.dev')).toBeNull();
    expect(getValidatedLanCorsOrigin('https://evil.example.com')).toBeNull();
    expect(getValidatedLanCorsOrigin('http://169.254.169.254')).toBeNull();
    expect(getValidatedLanCorsOrigin('http://192.168.1.10\r\nX-Injected: 1')).toBeNull();
    expect(randomHexCsprng(4)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('Security Hardening — External URL Allowlist', () => {
  it('allows verified WhatsApp, Google Maps, and official GitHub release URLs', () => {
    expect(isAllowedExternalActionUrl('https://wa.me/9647701234567?text=Hi')).toBe(true);
    expect(isAllowedExternalActionUrl('https://api.whatsapp.com/send?phone=9647701234567')).toBe(true);
    expect(isAllowedExternalActionUrl('https://www.google.com/maps/search/?api=1&query=Baghdad')).toBe(true);
    expect(isAllowedExternalActionUrl('https://google.com/maps/@33.3,44.4,15z')).toBe(true);
    expect(isAllowedExternalActionUrl('https://github.com/Hhi5/physiorecord/releases/latest')).toBe(true);
  });

  it('blocks downgraded HTTP, userinfo tricks, arbitrary hosts, and non-Maps Google paths', () => {
    expect(isAllowedExternalActionUrl('http://wa.me/9647701234567')).toBe(false);
    expect(isAllowedExternalActionUrl('https://wa.me@evil.com/path')).toBe(false);
    expect(isAllowedExternalActionUrl('https://evil.com/?u=https://wa.me/123')).toBe(false);
    expect(isAllowedExternalActionUrl('https://google.com/search?q=test')).toBe(false);
    expect(isAllowedExternalActionUrl('https://github.com/other/repo')).toBe(false);
    expect(isAllowedExternalActionUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalActionUrl('https://wa.me/123\r\nInjected')).toBe(false);
  });
});

describe('Security Hardening — Google Drive ID & Device ID Validation', () => {
  it('accepts valid Drive IDs and blocks query-injection payloads', () => {
    expect(isValidGoogleDriveId('1aBcDeFgHiJkLmNoPqRsTuVwXyZ_012345')).toBe(true);
    expect(isValidGoogleDriveId("' or trashed = false or '")).toBe(false);
    expect(isValidGoogleDriveId("12345678' in parents")).toBe(false);
    expect(isValidGoogleDriveId('../etc/passwd')).toBe(false);
    expect(isValidGoogleDriveId('short')).toBe(false);
  });

  it('validates safe sync device identifiers', () => {
    expect(isSafeSyncDeviceId('dev_1234abcd5678')).toBe(true);
    expect(isSafeSyncDeviceId('../../etc/passwd')).toBe(false);
    expect(isSafeSyncDeviceId('bad device id!')).toBe(false);
  });
});

describe('Security Hardening — Exported HTML XSS Sanitization & CSP', () => {
  it('strips scripts, nested script smuggling, inline event handlers, iframes, and dangerous URIs', () => {
    const malicious =
      '<h1>تقرير طبي</h1>' +
      '<script>alert(1)</script>' +
      '<scr<script>ipt>alert(2)</script>' +
      '<img src="x" onerror="alert(3)" />' +
      '<svg onload=alert(4)></svg>' +
      '<iframe src="https://evil.example"></iframe>' +
      '<a href="javascript:alert(5)">bad</a>' +
      '<a href="data:text/html,<script>alert(6)</script>">bad2</a>' +
      '<img src="data:image/png;base64,AAAA" alt="logo" />';

    const cleaned = sanitizeExportedDocumentHtml(malicious);
    expect(cleaned).toContain('<h1>تقرير طبي</h1>');
    expect(cleaned).toContain('data:image/png;base64,AAAA');
    expect(cleaned.toLowerCase()).not.toContain('<script');
    expect(cleaned.toLowerCase()).not.toContain('<iframe');
    expect(cleaned.toLowerCase()).not.toContain('onerror');
    expect(cleaned.toLowerCase()).not.toContain('onload');
    expect(cleaned.toLowerCase()).not.toContain('javascript:');
    expect(cleaned.toLowerCase()).not.toContain('data:text/html');
  });

  it('blocks slash-separated event handlers, HTML-entity javascript URIs, SVG active tags, and CSS @import', () => {
    const bypassPayload =
      '<img/onerror=alert(1) src="x">' +
      '<svg/onload="alert(2)"><animate onbegin="alert(3)" /><set attributeName="href" to="javascript:alert(4)" /><use href="#x" /></svg>' +
      '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&colon;alert(5)">entity-link</a>' +
      '<a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(6)">hex-link</a>' +
      '<style>@import url("https://evil.example/leak.css"); body { color: #000; }</style>';

    const cleaned = sanitizeExportedDocumentHtml(bypassPayload);
    const lower = cleaned.toLowerCase();
    expect(lower).not.toContain('onerror');
    expect(lower).not.toContain('onload');
    expect(lower).not.toContain('onbegin');
    expect(lower).not.toContain('<animate');
    expect(lower).not.toContain('<set');
    expect(lower).not.toContain('<use');
    expect(lower).not.toContain('alert(5)');
    expect(lower).not.toContain('alert(6)');
    expect(lower).not.toContain('@import');
    expect(cleaned).toContain('body { color: #000; }');
  });

  it('embeds strict offline CSP meta header into shareable HTML strings and files', async () => {
    const shareParams = {
      title: 'Clinical Report',
      docType: 'soap',
      sheetHtml: '<p>Safe content</p><img/onerror=alert(1) src=x>',
      dir: 'rtl' as const,
      lang: 'ar' as const,
      fileNameBase: 'report',
    };
    const htmlFromString = buildShareableDocumentHtmlString(shareParams);
    const file = buildShareableDocumentHtmlFile(shareParams);
    const html = await file.text();
    expect(htmlFromString).toBe(html);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<p>Safe content</p>');
    expect(html.toLowerCase()).not.toContain('onerror');
  });
});

describe('Security Hardening — Attachment Upload & Preview Hygiene', () => {
  it('rejects active SVG uploads and non-PDF files spoofing .pdf extension', async () => {
    const svgFile = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
      'posture.svg',
      { type: 'image/svg+xml' }
    );
    await expect(processAttachmentFile(svgFile)).rejects.toThrow();

    const fakePdf = new File(['<html><script>alert(1)</script></html>'], 'report.pdf', {
      type: 'application/pdf',
    });
    await expect(processAttachmentFile(fakePdf)).rejects.toThrow();

    const realPdf = new File(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'], 'valid-report.pdf', {
      type: 'application/pdf',
    });
    const processed = await processAttachmentFile(realPdf);
    expect(processed.mimeType).toBe('application/pdf');
    expect(isSafeAttachmentDataUrl(processed.payloadDataUrl, 'pdf')).toBe(true);
  });

  it('validates stored attachment data URLs strictly by expected kind', () => {
    expect(isSafeAttachmentDataUrl('data:application/pdf;base64,JVBERi0xLjc=', 'pdf')).toBe(true);
    expect(isSafeAttachmentDataUrl('data:text/html;base64,PHNjcmlwdD4=', 'pdf')).toBe(false);
    expect(isSafeAttachmentDataUrl('data:image/svg+xml;base64,PHN2Zz4=', 'pdf')).toBe(false);
    expect(isSafeAttachmentDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeAttachmentDataUrl('data:image/jpeg;base64,/9j/4AAQ', 'image')).toBe(true);
    expect(isSafeAttachmentDataUrl('data:image/svg+xml;base64,PHN2Zz4=', 'image')).toBe(false);
  });

  it('strips untrusted href injection in fallback annotated SVG compositor', async () => {
    const res = await renderAnnotatedPhotoDataUrl({
      sourceDataUrl: 'data:text/html," /><script>alert(1)</script><image href="',
      widthPx: 400,
      heightPx: 300,
      annotations: {
        gridMode: 'none',
        showPlumbLine: false,
        plumbLineXPercent: 50,
        showHorizontalLevel: false,
        horizontalLevelYPercent: 50,
        angles: [],
      },
    });
    const decoded = Buffer.from(
      res.payloadDataUrl.replace(/^data:image\/svg\+xml;base64,/, ''),
      'base64'
    ).toString('utf8');
    expect(decoded.toLowerCase()).not.toContain('<script');
    expect(decoded).not.toContain('data:text/html');
  });
});

describe('Security Hardening — OAuth Client Secret Storage Discipline', () => {
  it('never writes native Google OAuth clientSecret to localStorage and purges legacy key', async () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    };
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = { localStorage: fakeStorage };

    try {
      const legacyKey = 'physiorecord_android_google_oauth_client_secret_v1';
      fakeStorage.setItem(legacyKey, 'leaked-legacy-secret');

      const cfgBefore = getNativeGoogleOAuthConfig();
      expect(cfgBefore.clientSecret).toBe('');
      expect(fakeStorage.getItem(legacyKey)).toBeNull();

      saveNativeGoogleOAuthConfig({
        clientId: '12345.apps.googleusercontent.com',
        clientSecret: 'ephemeral-session-secret',
      });
      expect(fakeStorage.getItem(legacyKey)).toBeNull();
      expect(getNativeGoogleOAuthConfig().clientSecret).toBe('ephemeral-session-secret');

      await signOutGoogleDrive();
      expect(getNativeGoogleOAuthConfig().clientSecret).toBe('');
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  });
});

describe('Security Hardening — Prototype Pollution & Sync Crypto Bounds', () => {
  it('strips __proto__, constructor, and prototype keys via safeJsonParse', () => {
    const raw = '{"ok":true,"__proto__":{"polluted":true},"nested":{"constructor":{"x":1},"prototype":{"y":2},"safe":42}}';
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    expect(parsed.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    const nested = parsed.nested as Record<string, unknown>;
    expect(nested.safe).toBe(42);
    expect(Object.prototype.hasOwnProperty.call(nested, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(nested, 'prototype')).toBe(false);
  });

  it('blocks tampered sync envelopes with downgraded or excessive PBKDF2 iterations', async () => {
    const payload: ClinicSyncPayload = {
      schemaVersion: 1,
      deviceId: 'dev_test_0001',
      deviceLabel: 'Test Device',
      exportedAt: new Date().toISOString(),
      patients: [],
      episodes: [],
      sessions: [],
      soapNotes: [],
      clinicalAddenda: [],
      appointments: [],
      invoices: [],
      episodeClinicalStores: [],
      staffRoster: [],
    };
    const env = await encryptSyncEnvelope(payload, 'ClinicPass2026!', 1000);

    // Production minIterations check rejects downgraded 1000-iteration envelope
    await expect(
      decryptSyncEnvelope(env, 'ClinicPass2026!', {
        minIterations: PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
      })
    ).rejects.toThrow();

    // CPU-exhaustion DoS iterations rejected immediately before deriving key
    await expect(
      decryptSyncEnvelope({ ...env, iterations: 99_000_000 }, 'ClinicPass2026!')
    ).rejects.toThrow();

    // Malformed deviceId path traversal rejected
    await expect(
      decryptSyncEnvelope({ ...env, deviceId: '../../etc/passwd' }, 'ClinicPass2026!')
    ).rejects.toThrow();
  });
});

describe('Security Hardening — XLSX Zip Bomb & Matrix Bounds', () => {
  it('preserves normal XLSX parsing while rejecting archives declaring oversized entries', async () => {
    const normal = buildMinimalXlsxBuffer([
      ['الاسم', 'الهاتف'],
      ['أحمد علي', '07701234567'],
    ]);
    const parsed = await parseXlsxBufferToMatrix(new Uint8Array(normal).buffer);
    expect(parsed.length).toBe(2);
    expect(parsed[1][0]).toBe('أحمد علي');

    // Tamper the first central-directory header's declared uncompressed size to 50 MB
    const tampered = new Uint8Array(normal);
    const dv = new DataView(tampered.buffer);
    let cdPos = -1;
    for (let i = 0; i <= tampered.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        cdPos = i;
        break;
      }
    }
    expect(cdPos).toBeGreaterThan(0);
    dv.setUint32(cdPos + 24, 50 * 1024 * 1024, true); // 50 MB > 15 MB entry cap

    await expect(parseXlsxBufferToMatrix(tampered.buffer)).rejects.toThrow();
  });
});

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
