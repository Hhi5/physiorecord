// =======================================================================
// PhysioRecord — Phase F Unit Tests (Settings, Onboarding & Open Source)
// Covers F1 (Search & Simple/Advanced Mode), F2 (4-Step Onboarding Checklist),
// F3 (Bundled SemVer Changelog & Dexie v1–v10 Migration Guide),
// F4 (CC0 Iraqi Synthetic Data Generator & Public Demo Mode), and
// F5 (Community Content Pack Metadata & License Validator).
// =======================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  APP_SEMVER_VERSION,
  BUNDLED_CHANGELOG_RELEASES,
  DEXIE_MIGRATION_GUIDE_V1_TO_V10,
  SETTINGS_SEARCHABLE_CATALOG,
  computeOnboardingChecklistSummary,
  filterSettingsCatalog,
  matchesSettingsSearch,
  validateCommunityContentPackMetadata,
} from '../settingsOnboardingPhaseF';
import {
  IRAQI_SYNTHETIC_CITIES_AND_DISTRICTS,
  SYNTHETIC_DATA_LICENSE,
  SYNTHETIC_PATIENTS,
  generateSyntheticIraqiPatients,
} from '../../data/syntheticPatients';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  evaluateEscapeShortcut,
  resolveRestoredDraftNavigation,
} from '../draftNavigation';

describe('Phase F: Settings, Onboarding & Open-Source Community (F1–F5)', () => {
  beforeEach(() => {
    ClinicOperationsService.clearInMemoryCache();
  });

  it('F1: filters Settings catalog by Arabic/English search query and Simple vs Advanced view mode', () => {
    expect(SETTINGS_SEARCHABLE_CATALOG.length).toBeGreaterThanOrEqual(8);

    // Simple mode with empty search hides advanced entries
    const simpleItems = filterSettingsCatalog('', 'simple');
    const advancedItems = filterSettingsCatalog('', 'advanced');
    expect(simpleItems.every((item) => !item.isAdvanced)).toBe(true);
    expect(advancedItems.length).toBeGreaterThan(simpleItems.length);
    expect(advancedItems.some((item) => item.isAdvanced)).toBe(true);

    // Searching in Arabic ("نسخ احتياطي") or English ("backup") matches the backup entry
    const arMatches = filterSettingsCatalog('نسخ احتياطي', 'simple');
    expect(arMatches.some((item) => item.id === 'hub-backup-restore')).toBe(true);

    const enMatches = filterSettingsCatalog('passkey timeout', 'simple');
    expect(enMatches.some((item) => item.id === 'hub-security-lock')).toBe(true);

    // Searching for an advanced keyword ("DEK" or "تدوير") surfaces the advanced item even from Simple mode
    const cryptoMatches = filterSettingsCatalog('DEK', 'simple');
    expect(cryptoMatches.some((item) => item.id === 'adv-crypto-rotation')).toBe(true);

    expect(matchesSettingsSearch('دينار عراقي', 'العملة الأساسية بالدينار العراقي')).toBe(true);
    expect(matchesSettingsSearch('nonexistent_xyz_token', 'العملة الأساسية')).toBe(false);

    // Service persistence for Simple/Advanced mode
    expect(ClinicOperationsService.getSettingsViewMode()).toBe('advanced');
    ClinicOperationsService.setSettingsViewMode('simple');
    expect(ClinicOperationsService.getSettingsViewMode()).toBe('simple');
    ClinicOperationsService.setSettingsViewMode('advanced');
    expect(ClinicOperationsService.getSettingsViewMode()).toBe('advanced');
  });

  it('F2: computes 4-step Onboarding Checklist progress accurately and persists dismissal', async () => {
    const defaultProfile = ClinicOperationsService.getClinicProfile();
    const defaultBackupMeta = ClinicOperationsService.getBackupMeta();

    const initial = computeOnboardingChecklistSummary({
      clinicProfile: defaultProfile,
      patientCount: 0,
      backupMeta: defaultBackupMeta,
      lastRecoveryDrillAt: null,
      isDismissed: false,
    });

    expect(initial.totalCount).toBe(4);
    expect(initial.completedCount).toBe(0);
    expect(initial.allCompleted).toBe(false);
    expect(initial.steps.map((s) => s.id)).toEqual([
      'clinic_profile',
      'first_patient',
      'first_backup',
      'verify_recovery_key',
    ]);

    // Complete all 4 steps
    const completed = computeOnboardingChecklistSummary({
      clinicProfile: {
        ...defaultProfile,
        clinicNameAr: 'عيادة الرافدين للعلاج الطبيعي — بغداد',
        phone: '+964 770 111 2233',
        version: 2,
      },
      patientCount: 3,
      backupMeta: {
        ...defaultBackupMeta,
        lastBackupAt: '2026-11-14T10:00:00.000Z',
        lastVerifiedBackupAt: '2026-11-14T10:05:00.000Z',
      },
      lastRecoveryDrillAt: '2026-11-14T10:05:00.000Z',
      isDismissed: false,
    });

    expect(completed.completedCount).toBe(4);
    expect(completed.allCompleted).toBe(true);
    expect(completed.steps.every((s) => s.completed)).toBe(true);

    // Persist checklist dismissal via ClinicOperationsService
    expect(ClinicOperationsService.isOnboardingChecklistDismissed()).toBe(false);
    await ClinicOperationsService.setOnboardingChecklistDismissedAsync(true);
    expect(ClinicOperationsService.isOnboardingChecklistDismissed()).toBe(true);
    await ClinicOperationsService.resetOnboardingAsync();
    expect(ClinicOperationsService.isOnboardingChecklistDismissed()).toBe(false);
  });

  it('F3: bundles Semantic Versioning CHANGELOG releases and complete Dexie v1–v10 migration guide', () => {
    expect(APP_SEMVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(BUNDLED_CHANGELOG_RELEASES.length).toBeGreaterThanOrEqual(2);
    expect(BUNDLED_CHANGELOG_RELEASES[0].version).toBe('1.1.0');
    expect(BUNDLED_CHANGELOG_RELEASES[0].highlightsAr.length).toBeGreaterThanOrEqual(6);
    expect(BUNDLED_CHANGELOG_RELEASES[0].highlightsEn.length).toBeGreaterThanOrEqual(6);

    // Verify all 10 Dexie versions (v1 through v10) are documented in order
    expect(DEXIE_MIGRATION_GUIDE_V1_TO_V10.map((entry) => entry.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const v10 = DEXIE_MIGRATION_GUIDE_V1_TO_V10.find((e) => e.version === 10);
    expect(v10?.storesAdded).toContain('drafts');
  });

  it('F4: generates deterministic CC0-1.0 Iraqi synthetic patients with +964 phones and Iraqi cities', () => {
    expect(SYNTHETIC_DATA_LICENSE).toBe('CC0-1.0');
    expect(IRAQI_SYNTHETIC_CITIES_AND_DISTRICTS.length).toBeGreaterThanOrEqual(6);

    const coreFive = generateSyntheticIraqiPatients({ count: 5 });
    expect(coreFive).toHaveLength(5);
    expect(coreFive[0].fullNameAr).toBe(SYNTHETIC_PATIENTS[0].fullNameAr);

    const extendedTwelve = generateSyntheticIraqiPatients({ count: 12 });
    expect(extendedTwelve).toHaveLength(12);
    for (const p of extendedTwelve) {
      expect(p.isDemo).toBe(true);
      expect(p.phone).toMatch(/^\+964\s7\d{2}\s\d{3}\s\d{4}$/);
      expect(p.mrn).toMatch(/^PT-\d{6}$/);
      expect((p.address || '').length).toBeGreaterThan(3);
    }

    // Public Demo Mode flag toggle in ClinicOperationsService
    expect(ClinicOperationsService.isPublicDemoModeEnabled()).toBe(false);
    ClinicOperationsService.setPublicDemoModeEnabled(true);
    expect(ClinicOperationsService.isPublicDemoModeEnabled()).toBe(true);
    ClinicOperationsService.setPublicDemoModeEnabled(false);
    expect(ClinicOperationsService.isPublicDemoModeEnabled()).toBe(false);
  });

  it('F5: validates community content pack metadata requiring source and allowed SPDX license', () => {
    const validPack = JSON.stringify({
      packId: 'iraq-ortho-cc0-pack',
      name: 'حزمة قوالب العظام العراقية',
      version: '1.0.0',
      author: 'PhysioRecord Community',
      source: 'Original clinical templates contributed under CC0-1.0',
      license: 'CC0-1.0',
      snippets: [
        {
          slashTrigger: 'acl_week4',
          titleAr: 'متابعة الرباط الصليبي الأسبوع 4',
          titleEn: 'ACL Week 4 Follow-up',
          category: 'objective',
          bodyAr: 'ثني الركبة 110 درجة بدون انصباب.',
          bodyEn: 'Knee flexion 110 deg without effusion.',
        },
      ],
    });

    const validResult = validateCommunityContentPackMetadata(validPack);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    expect(validResult.license).toBe('CC0-1.0');
    expect(validResult.snippetCount).toBe(1);

    const missingSourceAndBadLicense = JSON.stringify({
      packId: 'bad-pack',
      name: 'Pack Without Source',
      version: '1.0.0',
      license: 'PROPRIETARY-RESTRICTED',
      snippets: [],
    });

    const invalidResult = validateCommunityContentPackMetadata(missingSourceAndBadLicense);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some((e) => e.includes('source'))).toBe(true);
    expect(invalidResult.errors.some((e) => e.includes('license'))).toBe(true);
    expect(invalidResult.errors.some((e) => e.includes('snippets'))).toBe(true);
  });

  it('resolves restored appointment draft navigation into Today schedule sub-tab when Solo Mode is active', () => {
    expect(resolveRestoredDraftNavigation('appointment', true)).toEqual({
      activeNav: 'today',
      todaySubTab: 'schedule',
    });
    expect(resolveRestoredDraftNavigation('appointment', false)).toEqual({
      activeNav: 'schedule',
      todaySubTab: null,
    });
    expect(resolveRestoredDraftNavigation('invoice', true)).toEqual({
      activeNav: 'finance',
      todaySubTab: null,
    });
  });

  it('prevents double-Escape Privacy Cover activation while a dialog modal or Command Palette is open', () => {
    // Double Esc when workspace has no open modals activates privacy cover
    const first = evaluateEscapeShortcut({
      isPrivacyCoverOpen: false,
      isGlobalSearchOpen: false,
      hasOpenDialog: false,
      lastEscapeAt: 0,
      now: 1000,
    });
    expect(first).toEqual({ action: 'arm_double_escape', nextLastEscapeAt: 1000 });

    const second = evaluateEscapeShortcut({
      isPrivacyCoverOpen: false,
      isGlobalSearchOpen: false,
      hasOpenDialog: false,
      lastEscapeAt: first.nextLastEscapeAt,
      now: 1300,
    });
    expect(second).toEqual({ action: 'toggle_privacy', nextLastEscapeAt: 0 });

    // Double Esc while an active dialog modal is open must ignore & reset double-Esc timer
    const modalEsc = evaluateEscapeShortcut({
      isPrivacyCoverOpen: false,
      isGlobalSearchOpen: false,
      hasOpenDialog: true,
      lastEscapeAt: 1000,
      now: 1200,
    });
    expect(modalEsc).toEqual({ action: 'ignored_modal', nextLastEscapeAt: 0 });

    // Esc while Global Search is open closes search and resets double-Esc timer
    const searchEsc = evaluateEscapeShortcut({
      isPrivacyCoverOpen: false,
      isGlobalSearchOpen: true,
      hasOpenDialog: true,
      lastEscapeAt: 1000,
      now: 1150,
    });
    expect(searchEsc).toEqual({ action: 'close_search', nextLastEscapeAt: 0 });

    // When Privacy Cover itself IS open, double Esc still resumes (toggles it off)
    const resumeArm = evaluateEscapeShortcut({
      isPrivacyCoverOpen: true,
      isGlobalSearchOpen: false,
      hasOpenDialog: true,
      lastEscapeAt: 0,
      now: 2000,
    });
    const resumeToggle = evaluateEscapeShortcut({
      isPrivacyCoverOpen: true,
      isGlobalSearchOpen: false,
      hasOpenDialog: true,
      lastEscapeAt: resumeArm.nextLastEscapeAt,
      now: 2250,
    });
    expect(resumeToggle).toEqual({ action: 'toggle_privacy', nextLastEscapeAt: 0 });
  });
});
