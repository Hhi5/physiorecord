// =======================================================================
// PhysioRecord — Unit Tests for Demo Localization, Duration Input,
// and Opt-In In-App GitHub Update Notification Logic
// =======================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localizeDemoBilingualTitle,
  localizeDemoText,
} from '../src/utils/demoLocalization';
import {
  commitDurationDraft,
  sanitizeDurationDraft,
} from '../src/utils/durationInput';
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  getPendingUpdateNotification,
  isAutoUpdateCheckEnabled,
  setAutoUpdateCheckEnabled,
  shouldRunAutoUpdateCheck,
  type SyncedGithubReleaseItem,
} from '../src/utils/updateSafety';

test('localizeDemoText translates known demo patient names and histories to en and ckb', () => {
  assert.equal(localizeDemoText('سلوى قاسم الطائي', 'en'), 'Salwa Qasim Al-Taie');
  assert.equal(localizeDemoText('سلوى قاسم الطائي', 'ckb'), 'سەلوا قاسم ئەلتائی');
  assert.equal(localizeDemoText('Salwa Qasim Al-Taie', 'ckb'), 'سەلوا قاسم ئەلتائی');

  const strokeAr =
    'جلطة دماغية نقص تروية في الشريان الدماغي الأوسط الأيسر قبل 3 أشهر، نتج عنها شلل نصفي أيمن مع حبسة كلامية خفيفة.';
  assert.match(localizeDemoText(strokeAr, 'en'), /ischemic stroke/i);
  assert.match(localizeDemoText(strokeAr, 'ckb'), /جەڵتەی مێشکی/);

  // Patient 1 seeded ACL episode title
  const aclTitleAr = 'إعادة تأهيل الركبة اليمنى بعد ترميم الرباط الصليبي (Right ACL Rehab)';
  assert.equal(
    localizeDemoText(aclTitleAr, 'en'),
    'Right Knee Post-ACL Reconstruction Rehabilitation'
  );
  assert.match(localizeDemoText(aclTitleAr, 'ckb'), /ئەژنۆی ڕاست/);
});

test('localizeDemoText leaves real clinician-entered custom strings untouched', () => {
  const realNote = 'Custom patient diagnosis entered manually by Dr. Haidar';
  assert.equal(localizeDemoText(realNote, 'ar'), realNote);
  assert.equal(localizeDemoText(realNote, 'en'), realNote);
  assert.equal(localizeDemoText(realNote, 'ckb'), realNote);
});

test('localizeDemoBilingualTitle resolves demo invoice/expense titles in ar, en, and ckb', () => {
  const ar = 'باقة تأهيل علاجي متكامل (10 جلسات)';
  const en = '10-Session Comprehensive Rehab Package';
  assert.equal(localizeDemoBilingualTitle(ar, en, 'ar'), ar);
  assert.equal(localizeDemoBilingualTitle(ar, en, 'en'), en);
  assert.equal(
    localizeDemoBilingualTitle(ar, en, 'ckb'),
    'پاکێجی چاکسازی چارەسەری تەواو (١٠ دانیشتن)'
  );
});

test('durationInput allows full clearing, converts Arabic-Indic digits, and clamps only on commit', () => {
  assert.equal(sanitizeDurationDraft(''), '');
  assert.equal(sanitizeDurationDraft('٣٥'), '35');
  assert.equal(sanitizeDurationDraft('٤٥ min'), '45');
  assert.equal(sanitizeDurationDraft('5'), '5');
  assert.equal(sanitizeDurationDraft('9999'), '999');

  assert.equal(commitDurationDraft('', { fallback: 45 }), 45);
  assert.equal(commitDurationDraft('35', { fallback: 45 }), 35);
  assert.equal(commitDurationDraft('2', { fallback: 45 }), 5);
  assert.equal(commitDurationDraft('500', { fallback: 45 }), 240);
  assert.equal(commitDurationDraft('٦٠', { fallback: 45 }), 60);
});

test('shouldRunAutoUpdateCheck stays off when disabled and throttles by 6 hours when enabled', () => {
  const nowMs = Date.parse('2026-11-21T12:00:00.000Z');
  assert.equal(
    shouldRunAutoUpdateCheck({ enabled: false, lastSyncedAt: null, nowMs }),
    false
  );
  assert.equal(
    shouldRunAutoUpdateCheck({ enabled: true, lastSyncedAt: null, nowMs }),
    true
  );

  const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(
    shouldRunAutoUpdateCheck({ enabled: true, lastSyncedAt: twoHoursAgo, nowMs }),
    false
  );

  const sevenHoursAgo = new Date(nowMs - (AUTO_UPDATE_CHECK_INTERVAL_MS + 60_000)).toISOString();
  assert.equal(
    shouldRunAutoUpdateCheck({ enabled: true, lastSyncedAt: sevenHoursAgo, nowMs }),
    true
  );
});

test('isAutoUpdateCheckEnabled defaults to true and respects explicit opt-out', () => {
  const store = new Map<string, string>();
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, v),
    },
    dispatchEvent: () => true,
  };
  try {
    assert.equal(isAutoUpdateCheckEnabled(), true);
    setAutoUpdateCheckEnabled(false);
    assert.equal(isAutoUpdateCheckEnabled(), false);
    setAutoUpdateCheckEnabled(true);
    assert.equal(isAutoUpdateCheckEnabled(), true);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('getPendingUpdateNotification detects newer stable releases and respects dismissal', () => {
  const releases: SyncedGithubReleaseItem[] = [
    {
      id: 2,
      tagName: 'v3.0.0-beta.1',
      version: '3.0.0-beta.1',
      name: 'Beta',
      body: '',
      htmlUrl: 'https://github.com/Hhi5/physiorecord/releases/tag/v3.0.0-beta.1',
      publishedAt: '2026-11-21T00:00:00.000Z',
      isPrerelease: true,
      assets: [],
    },
    {
      id: 1,
      tagName: 'v2.6.0',
      version: '2.6.0',
      name: 'Release 2.6.0',
      body: '- Bug fixes',
      htmlUrl: 'https://github.com/Hhi5/physiorecord/releases/tag/v2.6.0',
      publishedAt: '2026-11-20T00:00:00.000Z',
      isPrerelease: false,
      assets: [],
    },
  ];

  const found = getPendingUpdateNotification({
    releases,
    currentAppVersion: '2.5.0',
    dismissedTag: null,
  });
  assert.equal(found?.tagName, 'v2.6.0');

  assert.equal(
    getPendingUpdateNotification({
      releases,
      currentAppVersion: '2.6.0',
      dismissedTag: null,
    }),
    null
  );

  assert.equal(
    getPendingUpdateNotification({
      releases,
      currentAppVersion: '2.5.0',
      dismissedTag: 'v2.6.0',
    }),
    null
  );
});

test('Settings search catalog matches Arabic, Kurdish, and English queries for update notifications and fingerprint', async () => {
  const { filterSettingsCatalog } = await import('../src/utils/settingsOnboardingPhaseF');

  for (const query of ['اشعارات', 'إشعارات', 'تحديثات', 'github', 'notifications']) {
    const matches = filterSettingsCatalog(query, 'simple');
    assert.ok(
      matches.some((m) => m.id === 'hub-app-updates'),
      `Expected query "${query}" to match hub-app-updates`
    );
  }

  for (const query of ['بصمة', 'بصمه', 'fingerprint', 'پەنجەمۆر', 'biometric']) {
    const matches = filterSettingsCatalog(query, 'simple');
    assert.ok(
      matches.some((m) => m.id === 'hub-security-lock'),
      `Expected query "${query}" to match hub-security-lock`
    );
  }
});

test('Native Android BiometricPrompt bridge detects ready/none_enrolled and round-trips 32-byte DEK', async () => {
  const { getBiometricAvailabilityInfo, isWebAuthnPrfSupported } = await import(
    '../src/crypto/webauthnPrf'
  );
  const {
    enrollNativeAndroidBiometricDek,
    unlockNativeAndroidBiometricDek,
    clearNativeAndroidBiometricDek,
  } = await import('../src/platform/nativeBridge');

  const prevWindow = (globalThis as { window?: unknown }).window;
  let storedB64: string | null = null;
  let biometricStatus = 'ready';

  (globalThis as { window?: unknown }).window = {
    location: { protocol: 'https:', hostname: 'localhost' },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        PhysioRecordNative: {
          isBiometricAvailable: async () => ({
            available: biometricStatus === 'ready',
            status: biometricStatus,
            enrolled: Boolean(storedB64),
          }),
          enrollBiometricDek: async ({ dekBase64 }: { dekBase64: string }) => {
            storedB64 = dekBase64;
            return { enrolled: true };
          },
          unlockBiometricDek: async () => ({ dekBase64: storedB64 || '' }),
          clearBiometricDek: async () => {
            storedB64 = null;
            return { cleared: true };
          },
        },
      },
    },
  };

  try {
    const readyInfo = await getBiometricAvailabilityInfo();
    assert.equal(readyInfo.supported, true);
    assert.equal(readyInfo.mode, 'android-native');
    assert.equal(readyInfo.reason, 'none');
    assert.equal(await isWebAuthnPrfSupported(), true);

    const sampleDek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) sampleDek[i] = i + 1;

    assert.equal(await enrollNativeAndroidBiometricDek(sampleDek), true);
    const unlockedDek = await unlockNativeAndroidBiometricDek();
    assert.deepEqual(Array.from(unlockedDek), Array.from(sampleDek));

    const enrolledInfo = await getBiometricAvailabilityInfo();
    assert.equal(enrolledInfo.enrolledOnNative, true);

    await clearNativeAndroidBiometricDek();
    assert.equal(storedB64, null);

    biometricStatus = 'none_enrolled';
    const noneEnrolledInfo = await getBiometricAvailabilityInfo();
    assert.equal(noneEnrolledInfo.supported, false);
    assert.equal(noneEnrolledInfo.reason, 'not-enrolled-os');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});
