import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THERAPIST_WORKFLOW_CHAPTERS,
  DESKTOP_GUIDE_TOPICS,
  DESKTOP_SHORTCUTS,
  MOBILE_GUIDE_TOPICS,
  PAGE_SPOTLIGHT_TOURS,
  PAGE_TOURS_STORAGE_KEY,
  PLATFORM_OVERVIEW_PILLARS,
  QUICK_GUIDE_TOPICS,
  getFullAppWalkthroughStages,
  isPageTourSeen,
  loadPageToursState,
  markFullTourCompleted,
  markPageTourSeen,
  markWelcomeSeen,
  resetAllPageTours,
  resolveStepForDevice,
  setAutoPageToursEnabled,
  shouldAutoTriggerPageTour,
  shouldShowWelcomeOnboarding,
  type PageTourId,
} from '../pageSpotlightTours';
import {
  ALLOWED_NON_PHI_LOCALSTORAGE_KEYS,
  LocalStorageMigrationService,
} from '../../services/localStorageMigrationService';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal('localStorage', mockStorage);
  return mockStorage;
}

describe('Comprehensive Onboarding, Full-App Walkthrough & Device-Separated Guides', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.removeItem(PAGE_TOURS_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks first-entry Welcome screen, full walkthrough completion, and per-page tours independently', () => {
    const initial = loadPageToursState();
    expect(initial.welcomeSeen).toBe(false);
    expect(initial.fullTourCompleted).toBe(false);
    expect(initial.autoEnabled).toBe(true);
    expect(initial.seenPages).toEqual([]);
    expect(shouldShowWelcomeOnboarding(initial)).toBe(true);

    const afterWelcome = markWelcomeSeen();
    expect(afterWelcome.welcomeSeen).toBe(true);
    expect(shouldShowWelcomeOnboarding(afterWelcome)).toBe(false);
    expect(shouldAutoTriggerPageTour('today', afterWelcome)).toBe(true);

    const afterFull = markFullTourCompleted(['today', 'schedule', 'directory', 'finance', 'settings']);
    expect(afterFull.fullTourCompleted).toBe(true);
    expect(isPageTourSeen('today', afterFull)).toBe(true);
    expect(isPageTourSeen('settings', afterFull)).toBe(true);
    // Deep contextual screens still auto-trigger on first visit during real work
    expect(shouldAutoTriggerPageTour('patient_chart', afterFull)).toBe(true);
    expect(shouldAutoTriggerPageTour('session_soap', afterFull)).toBe(true);

    // Calling markPageTourSeen twice does not duplicate entries
    const deduped = markPageTourSeen('today');
    expect(deduped.seenPages.filter((id) => id === 'today').length).toBe(1);
  });

  it('respects disabling auto-tours and resetting all onboarding state', () => {
    markWelcomeSeen();
    markPageTourSeen('today');
    markPageTourSeen('directory');

    const disabled = setAutoPageToursEnabled(false);
    expect(disabled.autoEnabled).toBe(false);
    expect(shouldAutoTriggerPageTour('schedule', disabled)).toBe(false);
    expect(shouldAutoTriggerPageTour('finance', disabled)).toBe(false);

    const reset = resetAllPageTours();
    expect(reset.welcomeSeen).toBe(false);
    expect(reset.fullTourCompleted).toBe(false);
    expect(reset.autoEnabled).toBe(true);
    expect(reset.seenPages).toEqual([]);
    expect(shouldShowWelcomeOnboarding(reset)).toBe(true);
    expect(shouldAutoTriggerPageTour('today', reset)).toBe(true);
  });

  it('provides 5-stage or 6-stage Full-App Walkthrough (including Patient Record when patients exist)', () => {
    const soloEmpty = getFullAppWalkthroughStages(true, false);
    expect(soloEmpty.map((s) => s.pageId)).toEqual([
      'today',
      'schedule',
      'directory',
      'finance',
      'settings',
    ]);

    const soloWithPatients = getFullAppWalkthroughStages(true, true);
    expect(soloWithPatients.map((s) => s.pageId)).toEqual([
      'today',
      'schedule',
      'directory',
      'patient_chart',
      'finance',
      'settings',
    ]);
    expect(soloWithPatients[3].targetAction).toBe('patient_chart');

    const teamWithPatients = getFullAppWalkthroughStages(false, true);
    expect(teamWithPatients.map((s) => s.pageId)).toEqual([
      'reception',
      'schedule',
      'directory',
      'patient_chart',
      'finance',
      'settings',
    ]);
  });

  it('resolves distinct Desktop/Laptop vs Mobile/Phone selectors and copy for device-sensitive steps', () => {
    const navStep = PAGE_SPOTLIGHT_TOURS.today.steps[0];
    const desktopResolved = resolveStepForDevice(navStep, false);
    const mobileResolved = resolveStepForDevice(navStep, true);

    expect(desktopResolved.selectors).toEqual(['[data-testid="desktop-rail"]']);
    expect(mobileResolved.selectors).toEqual(['[data-testid="mobile-dock-trigger"]']);
    expect(desktopResolved.titleAr).not.toEqual(mobileResolved.titleAr);
    expect(desktopResolved.bodyAr).not.toEqual(mobileResolved.bodyAr);
  });

  it('defines trilingual spotlight tours for all 12 core & optional clinical screens', () => {
    const expectedIds: PageTourId[] = [
      'today',
      'reception',
      'schedule',
      'directory',
      'finance',
      'patient_chart',
      'session_soap',
      'backup_restore',
      'settings',
      'exercises',
      'analytics',
      'activity_log',
    ];
    for (const id of expectedIds) {
      const def = PAGE_SPOTLIGHT_TOURS[id];
      expect(def).toBeDefined();
      expect(def.steps.length).toBeGreaterThanOrEqual(2);
      const maxSteps =
        id === 'patient_chart' || id === 'session_soap'
          ? 8
          : id === 'today' || id === 'settings'
            ? 6
            : 4;
      expect(def.steps.length).toBeLessThanOrEqual(maxSteps);
      expect(def.summaryAr.trim().length).toBeGreaterThan(0);
      for (const step of def.steps) {
        expect(step.selectors.length).toBeGreaterThan(0);
        expect(step.titleAr.trim().length).toBeGreaterThan(0);
        expect(step.titleEn.trim().length).toBeGreaterThan(0);
        expect(step.titleCkb.trim().length).toBeGreaterThan(0);
        expect(step.bodyAr.trim().length).toBeGreaterThan(0);
        expect(step.bodyEn.trim().length).toBeGreaterThan(0);
        expect(step.bodyCkb.trim().length).toBeGreaterThan(0);
      }
    }

    // Patient Record tour covers all 4 clinical chart tabs + episode strip + more menu with Desktop/Mobile copy
    const chartTour = PAGE_SPOTLIGHT_TOURS.patient_chart;
    expect(chartTour.contextualOnly).toBeFalsy();
    const coveredTabs = new Set(chartTour.steps.map((s) => s.chartTab).filter(Boolean));
    expect(Array.from(coveredTabs).sort()).toEqual([
      'evaluation',
      'history',
      'overview',
      'profile',
    ]);
    const episodeStep = chartTour.steps[0];
    expect(resolveStepForDevice(episodeStep, false).bodyAr).not.toEqual(
      resolveStepForDevice(episodeStep, true).bodyAr
    );

    // Quick SOAP session tour covers 6 complete steps & is directly launchable
    const soapTour = PAGE_SPOTLIGHT_TOURS.session_soap;
    expect(soapTour.contextualOnly).toBeFalsy();
    expect(soapTour.steps.length).toBe(6);

    // Settings tour covers all 5 core clinic tabs with live settingsTab switching metadata
    const settingsTour = PAGE_SPOTLIGHT_TOURS.settings;
    expect(settingsTour.contextualOnly).toBeFalsy();
    const coveredSettingsTabs = settingsTour.steps.map((s) => s.settingsTab).filter(Boolean);
    expect(coveredSettingsTabs).toEqual(['clinic', 'modules', 'security', 'currency', 'display']);

    // Backup & Restore tour is directly launchable with export & restore tabs
    const backupTour = PAGE_SPOTLIGHT_TOURS.backup_restore;
    expect(backupTour.contextualOnly).toBeFalsy();
    expect(backupTour.steps.length).toBe(2);
  });

  it('provides complete 8-chapter Therapist Playbook plus separated Desktop and Mobile manuals', () => {
    expect(PLATFORM_OVERVIEW_PILLARS.length).toBe(3);
    expect(THERAPIST_WORKFLOW_CHAPTERS.length).toBe(8);
    expect(DESKTOP_GUIDE_TOPICS.length).toBeGreaterThanOrEqual(6);
    expect(MOBILE_GUIDE_TOPICS.length).toBeGreaterThanOrEqual(6);
    expect(DESKTOP_GUIDE_TOPICS.some((t) => t.id === 'desktop_patient_chart')).toBe(true);
    expect(MOBILE_GUIDE_TOPICS.some((t) => t.id === 'mobile_patient_chart')).toBe(true);
    expect(DESKTOP_SHORTCUTS.length).toBeGreaterThanOrEqual(5);
    expect(QUICK_GUIDE_TOPICS.length).toBe(
      THERAPIST_WORKFLOW_CHAPTERS.length +
        DESKTOP_GUIDE_TOPICS.length +
        MOBILE_GUIDE_TOPICS.length
    );

    for (const chapter of THERAPIST_WORKFLOW_CHAPTERS) {
      expect(chapter.device).toBe('all');
      expect(chapter.stepsAr.length).toBeGreaterThanOrEqual(4);
      expect(chapter.stepsEn.length).toBeGreaterThanOrEqual(4);
      expect(chapter.stepsCkb.length).toBeGreaterThanOrEqual(4);
    }

    for (const topic of DESKTOP_GUIDE_TOPICS) {
      expect(topic.device).toBe('desktop');
      expect(topic.stepsAr.length).toBeGreaterThanOrEqual(2);
      expect(topic.stepsEn.length).toBeGreaterThanOrEqual(2);
      expect(topic.stepsCkb.length).toBeGreaterThanOrEqual(2);
    }

    for (const topic of MOBILE_GUIDE_TOPICS) {
      expect(topic.device).toBe('mobile');
      expect(topic.stepsAr.length).toBeGreaterThanOrEqual(2);
      expect(topic.stepsEn.length).toBeGreaterThanOrEqual(2);
      expect(topic.stepsCkb.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('registers PAGE_TOURS_STORAGE_KEY as an allowed non-PHI key so migration scanner never flags it', () => {
    expect(ALLOWED_NON_PHI_LOCALSTORAGE_KEYS.has(PAGE_TOURS_STORAGE_KEY)).toBe(true);
    markWelcomeSeen();
    markPageTourSeen('today');
    expect(LocalStorageMigrationService.scanUnmigratedItems()).toEqual([]);
    expect(LocalStorageMigrationService.findPhiLikeLocalStorageEntries()).toEqual([]);
  });
});
