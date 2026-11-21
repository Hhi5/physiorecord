// =======================================================================
// PhysioRecord — Application Shell & Global Header (Batch 3 Simplification)
// - Desktop Global Header: Short page title, Global Search (Ctrl/Cmd+K),
//   ONE primary "New Patient" button, and User Menu (staff switch, language,
//   light/dark theme, backup, clinical reference, settings, lock).
// - Mobile Top Bar: Short non-truncated title + max 2 icon buttons + overflow menu.
// - Mobile Bottom Nav: Max 5 items (Queue, Patients, Schedule, Finance, More -> HEP, Audit, Settings).
// - Migration Warning Banner: Dismissible, compact on mobile, with "Details" + Export option.
// =======================================================================

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Sidebar, type ClinicNavTab } from './Sidebar';
import { MobileFloatingDock } from './MobileFloatingDock';
import { AccountMenuPopover } from './AccountMenuPopover';
import { CommandPalette } from './CommandPalette';
import { PatientDirectory } from '../PatientDirectory';
import { PrivacyCoverOverlay } from '../PrivacyCoverOverlay';
import { RecoveredWorkBanner } from '../RecoveredWorkBanner';
import type { DecryptedDraftRecord } from '../../types/clinical';
import { LocalStorageMigrationService } from '../../services/localStorageMigrationService';
import {
  usePwaStatus,
  applyPwaUpdate,
  triggerPwaInstallPrompt,
} from '../../pwa/pwaClient';
import {
  getPatientMrn,
  hasAnyDemoPatients,
} from '../../utils/mrn';
import { DemoBadge } from '../ui/Primitives';
import { BrandLogo } from '../ui/BrandLogo';
import { ModalDialog } from '../ui/Dialog';
import { PatientSearchEngine } from '../../utils/arabicSearch';
import {
  APP_SEMVER_VERSION,
  isPublicDemoUrlOrEnv,
} from '../../utils/settingsOnboardingPhaseF';
import {
  GITHUB_RELEASES_UPDATED_EVENT,
  dismissUpdateTag,
  getDismissedUpdateTag,
  getPendingUpdateNotification,
  isAutoUpdateCheckEnabled,
  loadCachedGithubReleases,
  notifyGithubReleasesUpdated,
  saveCachedGithubReleases,
  shouldRunAutoUpdateCheck,
  type SyncedGithubReleaseItem,
} from '../../utils/updateSafety';
import { fetchOfficialGitHubReleases } from '../../platform/nativeBridge';
import {
  ACTIVE_MODAL_DIALOG_SELECTOR,
  evaluateEscapeShortcut,
  resolveRestoredDraftNavigation,
  type TodaySubTab,
} from '../../utils/draftNavigation';

const PatientWorkspace = lazy(() =>
  import('../workspace/PatientWorkspace').then((m) => ({ default: m.PatientWorkspace }))
);
const PatientModal = lazy(() =>
  import('../PatientModal').then((m) => ({ default: m.PatientModal }))
);
const BackupRestoreModal = lazy(() =>
  import('../BackupRestoreModal').then((m) => ({ default: m.BackupRestoreModal }))
);
const SyntheticDataModal = lazy(() =>
  import('../SyntheticDataModal').then((m) => ({ default: m.SyntheticDataModal }))
);
const SettingsModal = lazy(() =>
  import('../SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const RecoveryDrillModal = lazy(() =>
  import('../clinic/RecoveryDrillModal').then((m) => ({ default: m.RecoveryDrillModal }))
);
const PasswordReminderModal = lazy(() =>
  import('../PasswordReminderModal').then((m) => ({ default: m.PasswordReminderModal }))
);
const MigrationResolutionModal = lazy(() =>
  import('../MigrationResolutionModal').then((m) => ({ default: m.MigrationResolutionModal }))
);
const ReceptionCommandCenterView = lazy(() =>
  import('../clinic/ReceptionCommandCenterView').then((m) => ({
    default: m.ReceptionCommandCenterView,
  }))
);
const AppointmentScheduleView = lazy(() =>
  import('../clinic/AppointmentScheduleView').then((m) => ({
    default: m.AppointmentScheduleView,
  }))
);
const IraqiFinancialLedgerView = lazy(() =>
  import('../clinic/IraqiFinancialLedgerView').then((m) => ({
    default: m.IraqiFinancialLedgerView,
  }))
);
const ExerciseLibraryHepView = lazy(() =>
  import('../clinic/ExerciseLibraryHepView').then((m) => ({
    default: m.ExerciseLibraryHepView,
  }))
);
const ActivityLogView = lazy(() =>
  import('../clinic/ActivityLogView').then((m) => ({ default: m.ActivityLogView }))
);
const TodayCommandView = lazy(() =>
  import('../clinic/TodayCommandView').then((m) => ({ default: m.TodayCommandView }))
);
const LocalAnalyticsView = lazy(() =>
  import('../clinic/LocalAnalyticsView').then((m) => ({ default: m.LocalAnalyticsView }))
);
const PatientKioskModal = lazy(() =>
  import('../clinic/PatientKioskModal').then((m) => ({ default: m.PatientKioskModal }))
);
const GuidedTourModal = lazy(() =>
  import('../clinic/ContextualTipsAndTour').then((m) => ({ default: m.GuidedTourModal }))
);
const SpotlightTourOverlay = lazy(() =>
  import('../clinic/SpotlightTourOverlay').then((m) => ({ default: m.SpotlightTourOverlay }))
);
const WelcomeOnboardingModal = lazy(() =>
  import('../clinic/WelcomeOnboardingModal').then((m) => ({ default: m.WelcomeOnboardingModal }))
);
const FirstRunModeWizardModal = lazy(() =>
  import('../FirstRunModeWizardModal').then((m) => ({ default: m.FirstRunModeWizardModal }))
);
const PatientMergeModal = lazy(() => import('../clinic/PatientMergeModal'));
import {
  PAGE_SPOTLIGHT_TOURS,
  getFullAppWalkthroughStages,
  loadPageToursState,
  markFullTourCompleted,
  markPageTourSeen,
  markWelcomeSeen,
  setAutoPageToursEnabled,
  shouldAutoTriggerPageTour,
  shouldShowWelcomeOnboarding,
  type PageTourId,
  type PageToursState,
} from '../../utils/pageSpotlightTours';
import { db } from '../../db/db';
import { SYNTHETIC_PATIENTS } from '../../data/syntheticPatients';
import { usePatients } from '../../context/PatientContext';
import { useVault } from '../../context/VaultContext';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { localDate } from '../../utils/date';
import type { PatientRecord } from '../../types/clinical';
import type {
  ClinicRoleId,
  ClinicStaffMember,
  FinishUndoSnapshot,
} from '../../types/clinicManagement';
import {
  User,
  AlertTriangle,
  Download,
  X,
  Database,
  KeyRound,
  RefreshCw,
  Smartphone,
  RotateCcw,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { patients, savePatient, deleteAllDemoPatients, refreshPatients } = usePatients();
  const {
    dek,
    lock,
    secondsUntilAutoLock,
    stayUnlocked,
    recoveredDrafts,
    dismissRecoveredDraft,
    clearAllRecoveredDrafts,
    isRecoveryDrillDue,
    snoozeRecoveryDrillBanner,
    isPasswordReminderDueNow,
    snoozePasswordReminder,
    lastRepairSummary,
    repairError,
    lastMigrationResult,
    dismissRepairNotice,
  } = useVault();
  const { language, isRtl, bi, t } = useLanguage();

  const [isSoloMode, setIsSoloMode] = useState<boolean>(() =>
    ClinicOperationsService.isSoloMode()
  );
  const [showFirstRunModeWizard, setShowFirstRunModeWizard] = useState<boolean>(() =>
    ClinicOperationsService.requiresFirstRunModeWizard()
  );
  const [activeNav, setActiveNav] = useState<ClinicNavTab>(() =>
    ClinicOperationsService.isSoloMode() ? 'today' : 'reception'
  );
  const [todaySubTabRequest, setTodaySubTabRequest] = useState<{
    tab: TodaySubTab;
    nonce: number;
  } | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedSessionLaunch, setSelectedSessionLaunch] = useState<{
    sessionId: string;
    autoOpenFinish?: boolean;
  } | null>(null);
  const [activeRole, setActiveRole] = useState<ClinicRoleId>(
    () => ClinicOperationsService.getActiveStaff().role
  );

  // Global Panels / Sheets State
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<PatientRecord | null>(null);
  const [mergeModalExistingPatientId, setMergeModalExistingPatientId] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'currency' | 'clinic' | 'display' | 'staff' | 'sync' | 'security' | 'modules' | 'developer'
  >('clinic');
  const [isSessionFocusMode, setIsSessionFocusMode] = useState(false);
  const [isMobileAccountMenuOpen, setIsMobileAccountMenuOpen] = useState(false);
  const mobileAccountBtnRef = useRef<HTMLButtonElement | null>(null);
  const [quickBookingNonce, setQuickBookingNonce] = useState(0);
  const [quickInvoiceNonce, setQuickInvoiceNonce] = useState(0);

  // Global Command Palette & Search (Ctrl/Cmd+K) State
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [commandSearchActivated, setCommandSearchActivated] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [commandHighlightIdx, setCommandHighlightIdx] = useState(0);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [isKioskModalOpen, setIsKioskModalOpen] = useState(false);

  // Migration Resolution Banner & Modal State (Dismissible)
  const [migrationBannerDismissed, setMigrationBannerDismissed] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [unmigratedCount, setUnmigratedCount] = useState<number>(0);

  // Admin PIN Modal & First-Run Mandatory Setup State (Phase 1.1)
  const [pendingAdminRole, setPendingAdminRole] = useState<ClinicRoleId | null>(null);
  const [adminPinAttempt, setAdminPinAttempt] = useState('');
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [adminPinSubmitting, setAdminPinSubmitting] = useState(false);
  const [showFirstRunPinModal, setShowFirstRunPinModal] = useState<boolean>(() =>
    ClinicOperationsService.requiresFirstRunAdminPinSetup()
  );
  const [firstRunPin, setFirstRunPin] = useState('');
  const [firstRunPinConfirm, setFirstRunPinConfirm] = useState('');
  const [firstRunPinError, setFirstRunPinError] = useState<string | null>(null);
  const [firstRunPinSaving, setFirstRunPinSaving] = useState(false);

  const [staffRoster, setStaffRoster] = useState<ClinicStaffMember[]>(() =>
    ClinicOperationsService.getStaffRoster()
  );
  const [showExerciseLibrary, setShowExerciseLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isExerciseLibraryVisible()
  );
  const [showAnalyticsModule, setShowAnalyticsModule] = useState<boolean>(() =>
    ClinicOperationsService.isAnalyticsModuleEnabled()
  );
  const [enableKioskModule, setEnableKioskModule] = useState<boolean>(() =>
    ClinicOperationsService.isKioskModuleEnabled()
  );
  const [hasDemoOps, setHasDemoOps] = useState<boolean>(() =>
    ClinicOperationsService.hasDemoOperationsData()
  );
  const [isPublicDemoActive, setIsPublicDemoActive] = useState<boolean>(
    () => isPublicDemoUrlOrEnv() || ClinicOperationsService.isPublicDemoModeEnabled()
  );
  const [lastBackupIso, setLastBackupIso] = useState<string | null>(
    () => ClinicOperationsService.getBackupMeta().lastBackupAt ?? null
  );
  const [backupBannerDismissed, setBackupBannerDismissed] = useState(false);
  const [iosInstallDismissed, setIosInstallDismissed] = useState(false);
  const [pendingGithubUpdate, setPendingGithubUpdate] = useState<SyncedGithubReleaseItem | null>(
    () =>
      getPendingUpdateNotification({
        releases: loadCachedGithubReleases()?.releases,
        currentAppVersion: APP_SEMVER_VERSION,
        dismissedTag: getDismissedUpdateTag(),
      })
  );
  const pwa = usePwaStatus();

  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isPatientSessionActive, setIsPatientSessionActive] = useState(false);
  const [pageToursState, setPageToursState] = useState<PageToursState>(() => loadPageToursState());
  const [activeSpotlightTourId, setActiveSpotlightTourId] = useState<PageTourId | null>(null);
  const [fullWalkthroughStageIdx, setFullWalkthroughStageIdx] = useState<number | null>(null);
  const [isRecoveryDrillOpen, setIsRecoveryDrillOpen] = useState(false);
  const [isPasswordReminderOpen, setIsPasswordReminderOpen] = useState(false);
  const [isPrivacyCoverOpen, setIsPrivacyCoverOpen] = useState(false);
  const lastEscAtRef = useRef<number>(0);
  const [finishUndoToast, setFinishUndoToast] = useState<{
    snapshot: FinishUndoSnapshot;
    message: string;
  } | null>(null);
  const finishUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const syncOperationsState = () => {
      setStaffRoster(ClinicOperationsService.getStaffRoster());
      setShowExerciseLibrary(ClinicOperationsService.isExerciseLibraryVisible());
      setShowAnalyticsModule(ClinicOperationsService.isAnalyticsModuleEnabled());
      setEnableKioskModule(ClinicOperationsService.isKioskModuleEnabled());
      setHasDemoOps(ClinicOperationsService.hasDemoOperationsData());
      setIsPublicDemoActive(
        isPublicDemoUrlOrEnv() || ClinicOperationsService.isPublicDemoModeEnabled()
      );
      setLastBackupIso(ClinicOperationsService.getBackupMeta().lastBackupAt ?? null);
      setActiveRole(ClinicOperationsService.getActiveStaff().role);
      const nextSolo = ClinicOperationsService.isSoloMode();
      setIsSoloMode(nextSolo);
      setShowFirstRunModeWizard(ClinicOperationsService.requiresFirstRunModeWizard());
      setShowFirstRunPinModal(ClinicOperationsService.requiresFirstRunAdminPinSetup());
    };
    syncOperationsState();
    const unsubOps = ClinicOperationsService.subscribe(syncOperationsState);
    const syncPageTours = () => setPageToursState(loadPageToursState());
    window.addEventListener('physiorecord-staff-updated', syncOperationsState);
    window.addEventListener('physiorecord-modules-updated', syncOperationsState);
    window.addEventListener('physiorecord-backup-updated', syncOperationsState);
    window.addEventListener('physiorecord-demo-data-changed', syncOperationsState);
    window.addEventListener('physiorecord-page-tours-updated', syncPageTours);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-staff-updated', syncOperationsState);
      window.removeEventListener('physiorecord-modules-updated', syncOperationsState);
      window.removeEventListener('physiorecord-backup-updated', syncOperationsState);
      window.removeEventListener('physiorecord-demo-data-changed', syncOperationsState);
      window.removeEventListener('physiorecord-page-tours-updated', syncPageTours);
    };
  }, []);

  // In-App GitHub Release Update Notification (100% offline/local by default; auto-check is strictly opt-in)
  useEffect(() => {
    const refreshPendingUpdate = () => {
      setPendingGithubUpdate(
        getPendingUpdateNotification({
          releases: loadCachedGithubReleases()?.releases,
          currentAppVersion: APP_SEMVER_VERSION,
          dismissedTag: getDismissedUpdateTag(),
        })
      );
    };
    refreshPendingUpdate();
    window.addEventListener(GITHUB_RELEASES_UPDATED_EVENT, refreshPendingUpdate);

    let cancelled = false;
    const autoEnabled = isAutoUpdateCheckEnabled();
    const cached = loadCachedGithubReleases();
    const isAutomatedTest = typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

    if (
      autoEnabled &&
      isOnline &&
      !isAutomatedTest &&
      shouldRunAutoUpdateCheck({
        enabled: true,
        lastSyncedAt: cached?.syncedAt,
      })
    ) {
      void fetchOfficialGitHubReleases()
        .then((res) => {
          if (cancelled || !res.ok || res.releases.length === 0) return;
          saveCachedGithubReleases(res.releases);
          notifyGithubReleasesUpdated();
        })
        .catch(() => {
          // Silent failure keeps offline clinical workflow uninterrupted
        });
    }

    return () => {
      cancelled = true;
      window.removeEventListener(GITHUB_RELEASES_UPDATED_EVENT, refreshPendingUpdate);
    };
  }, []);

  useEffect(() => {
    const scanned = LocalStorageMigrationService.scanUnmigratedItems(
      lastMigrationResult?.report
    );
    setUnmigratedCount(scanned.length);
  }, [lastMigrationResult]);

  useEffect(() => {
    if (!showExerciseLibrary && activeNav === 'exercises') {
      setActiveNav(isSoloMode ? 'today' : 'reception');
    } else if (!showAnalyticsModule && activeNav === 'analytics') {
      setActiveNav(isSoloMode ? 'today' : 'reception');
    } else if (
      isSoloMode &&
      (activeNav === 'reception' || activeNav === 'activity_log')
    ) {
      setActiveNav('today');
    } else if (!isSoloMode && activeNav === 'today') {
      setActiveNav('reception');
    }
  }, [showExerciseLibrary, showAnalyticsModule, activeNav, isSoloMode]);

  // Global Ctrl/Cmd+K (Search), Ctrl/Cmd+L (Instant Lock), Esc-Esc (Privacy Cover)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lock();
      } else if (e.key === 'Escape') {
        const hasOpenDialog = Boolean(document.querySelector(ACTIVE_MODAL_DIALOG_SELECTOR));
        if (isMobileAccountMenuOpen && !hasOpenDialog && !isGlobalSearchOpen && !isPrivacyCoverOpen) {
          e.preventDefault();
          setIsMobileAccountMenuOpen(false);
          return;
        }
        const decision = evaluateEscapeShortcut({
          isPrivacyCoverOpen,
          isGlobalSearchOpen,
          hasOpenDialog,
          lastEscapeAt: lastEscAtRef.current,
          now: Date.now(),
        });
        lastEscAtRef.current = decision.nextLastEscapeAt;
        if (decision.action === 'close_search') {
          setIsGlobalSearchOpen(false);
        } else if (decision.action === 'toggle_privacy') {
          setIsPrivacyCoverOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isMobileAccountMenuOpen, isGlobalSearchOpen, isPrivacyCoverOpen, lock]);

  // Android Hardware Back Button / Gesture Handler (Closes open modals/menus or steps back in navigation)
  useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (isPrivacyCoverOpen) {
        e.preventDefault();
        setIsPrivacyCoverOpen(false);
        return;
      }
      if (isMobileAccountMenuOpen) {
        e.preventDefault();
        setIsMobileAccountMenuOpen(false);
        return;
      }
      if (isGlobalSearchOpen) {
        e.preventDefault();
        setIsGlobalSearchOpen(false);
        return;
      }
      if (isSettingsModalOpen) {
        e.preventDefault();
        setIsSettingsModalOpen(false);
        return;
      }
      if (isBackupModalOpen) {
        e.preventDefault();
        setIsBackupModalOpen(false);
        return;
      }
      if (isSeedModalOpen) {
        e.preventDefault();
        setIsSeedModalOpen(false);
        return;
      }
      if (isPatientModalOpen) {
        e.preventDefault();
        setIsPatientModalOpen(false);
        return;
      }
      if (activeSpotlightTourId) {
        e.preventDefault();
        if (fullWalkthroughStageIdx !== null) {
          setFullWalkthroughStageIdx(null);
        }
        markPageTourSeen(activeSpotlightTourId);
        setActiveSpotlightTourId(null);
        return;
      }
      if (isWelcomeOpen) {
        e.preventDefault();
        setPageToursState(markWelcomeSeen());
        setIsWelcomeOpen(false);
        return;
      }
      if (isTourOpen) {
        e.preventDefault();
        setIsTourOpen(false);
        return;
      }
      if (isRecoveryDrillOpen) {
        e.preventDefault();
        setIsRecoveryDrillOpen(false);
        return;
      }
      if (isPasswordReminderOpen) {
        e.preventDefault();
        setIsPasswordReminderOpen(false);
        return;
      }
      if (isMigrationModalOpen) {
        e.preventDefault();
        setIsMigrationModalOpen(false);
        return;
      }
      if (isKioskModalOpen) {
        e.preventDefault();
        setIsKioskModalOpen(false);
        return;
      }
      const openDialog = document.querySelector(ACTIVE_MODAL_DIALOG_SELECTOR);
      if (openDialog) {
        e.preventDefault();
        const escapeTarget =
          (document.activeElement && openDialog.contains(document.activeElement)
            ? document.activeElement
            : openDialog) as HTMLElement;
        escapeTarget.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          })
        );
        return;
      }
      if (selectedPatientId !== null) {
        e.preventDefault();
        const patientBackEvent = new CustomEvent('physiorecord-patient-back', { cancelable: true });
        window.dispatchEvent(patientBackEvent);
        return;
      }
      const defaultHomeNav = isSoloMode ? 'today' : 'reception';
      if (activeNav !== defaultHomeNav) {
        e.preventDefault();
        setActiveNav(defaultHomeNav);
      }
    };
    window.addEventListener('physiorecord-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('physiorecord-hardware-back', handleHardwareBack);
  }, [
    isPrivacyCoverOpen,
    isMobileAccountMenuOpen,
    isGlobalSearchOpen,
    isSettingsModalOpen,
    isBackupModalOpen,
    isSeedModalOpen,
    isPatientModalOpen,
    activeSpotlightTourId,
    fullWalkthroughStageIdx,
    isWelcomeOpen,
    isTourOpen,
    isRecoveryDrillOpen,
    isPasswordReminderOpen,
    isMigrationModalOpen,
    isKioskModalOpen,
    selectedPatientId,
    isSoloMode,
    activeNav,
  ]);

  const handleRestoreRecoveredDraft = (draft: DecryptedDraftRecord) => {
    if (draft.draftType === 'soap' || draft.draftType === 'flowsheet') {
      if (draft.patientId) {
        setSelectedSessionLaunch({ sessionId: draft.entityId });
        setSelectedPatientId(draft.patientId);
      }
      return;
    }
    setSelectedPatientId(null);
    const target = resolveRestoredDraftNavigation(draft.draftType, isSoloMode);
    setActiveNav(target.activeNav);
    if (target.todaySubTab) {
      const requestedTab = target.todaySubTab;
      setTodaySubTabRequest((prev) => ({
        tab: requestedTab,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    }
  };

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setCommandSearchActivated(true);
      setTimeout(() => globalSearchInputRef.current?.focus(), 30);
    } else {
      setGlobalSearchQuery('');
    }
  }, [isGlobalSearchOpen]);

  const isBackupOverdue = (() => {
    if (backupBannerDismissed || patients.length === 0) return false;
    if (!lastBackupIso) return true;
    const diffMs = Date.now() - new Date(lastBackupIso).getTime();
    return diffMs > 7 * 24 * 60 * 60 * 1000;
  })();

  const formattedLastBackup = lastBackupIso
    ? lastBackupIso.slice(0, 10)
    : bi('لم يتم النسخ بعد', 'Never', 'هێشتا پاشەکەوت نەکراوە');

  const hasDemoRecords =
    hasAnyDemoPatients(patients) || hasDemoOps;

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || null;
  const activePatients = patients.filter((p) => !p.isArchived);

  const commandSearchEngine = React.useMemo(() => {
    if (!commandSearchActivated && !isGlobalSearchOpen && !globalSearchQuery.trim()) {
      return null;
    }
    return new PatientSearchEngine(activePatients, (p, idx) => getPatientMrn(p, idx));
  }, [activePatients, commandSearchActivated, isGlobalSearchOpen, globalSearchQuery]);

  const globalFilteredPatients = React.useMemo(() => {
    const trimmed = globalSearchQuery.trim();
    if (!trimmed) return activePatients;
    return commandSearchEngine
      ? commandSearchEngine.search(globalSearchQuery)
      : new PatientSearchEngine(activePatients, (p, idx) => getPatientMrn(p, idx)).search(
          globalSearchQuery
        );
  }, [commandSearchEngine, activePatients, globalSearchQuery]);

  const handleSelectPatient = (patient: PatientRecord | null) => {
    setSelectedSessionLaunch(null);
    setSelectedPatientId(patient ? patient.id : null);
  };

  const triggerFinishUndoToast = (snapshot: FinishUndoSnapshot, message: string) => {
    if (finishUndoTimerRef.current) {
      clearTimeout(finishUndoTimerRef.current);
    }
    setFinishUndoToast({ snapshot, message });
    finishUndoTimerRef.current = setTimeout(() => {
      setFinishUndoToast(null);
      finishUndoTimerRef.current = null;
    }, 8000);
  };

  const handleLoadTourDemoData = async () => {
    for (let i = 0; i < SYNTHETIC_PATIENTS.length; i++) {
      const { id: fixedId, ...patientData } = SYNTHETIC_PATIENTS[i];
      if (!fixedId) continue;
      await savePatient(patientData, fixedId);
    }
    ClinicOperationsService.seedDemoOperationsData();
    await refreshPatients();
    window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
  };

  const handleDeleteTourDemoData = async () => {
    await deleteAllDemoPatients();
    ClinicOperationsService.deleteAllDemoOperationsData();
    await refreshPatients();
    window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
  };

  const handleOpenNewPatient = () => {
    setPatientToEdit(null);
    setIsPatientModalOpen(true);
  };

  const handleQuickBookAppointment = () => {
    setSelectedSessionLaunch(null);
    setSelectedPatientId(null);
    setActiveNav('schedule');
    setQuickBookingNonce((n) => n + 1);
  };

  const handleQuickNewInvoice = () => {
    setSelectedSessionLaunch(null);
    setSelectedPatientId(null);
    setActiveNav('finance');
    setQuickInvoiceNonce((n) => n + 1);
  };

  useEffect(() => {
    if (selectedPatientId === null) {
      setIsSessionFocusMode(false);
    }
    setIsMobileAccountMenuOpen(false);
  }, [selectedPatientId]);

  useEffect(() => {
    if (isSessionFocusMode || isPrivacyCoverOpen) {
      setIsMobileAccountMenuOpen(false);
    }
  }, [isSessionFocusMode, isPrivacyCoverOpen]);

  const handleQuickRoleSwitch = (role: ClinicRoleId) => {
    if (role === 'admin' && activeRole !== 'admin') {
      if (ClinicOperationsService.requiresFirstRunAdminPinSetup()) {
        setShowFirstRunPinModal(true);
        setFirstRunPin('');
        setFirstRunPinConfirm('');
        setFirstRunPinError(null);
        return;
      }
      setPendingAdminRole('admin');
      setAdminPinAttempt('');
      setAdminPinError(null);
      return;
    }
    const matchedStaff =
      staffRoster.find((s) => s.role === role) || staffRoster[0];
    const updated = ClinicOperationsService.setActiveStaff(matchedStaff.id);
    setActiveRole(updated.role);
  };

  const handleConfirmAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinSubmitting) return;
    setAdminPinSubmitting(true);
    setAdminPinError(null);
    try {
      const check = await ClinicOperationsService.verifyAdminPinAsync(adminPinAttempt);
      if (check.requiresSetup) {
        setPendingAdminRole(null);
        setShowFirstRunPinModal(true);
        return;
      }
      if (!check.ok) {
        if (check.rateLimited) {
          setAdminPinError(
            bi(
              `محاولات خاطئة متكررة. يرجى الانتظار ${check.remainingSeconds} ثانية قبل المحاولة مجدداً.`,
              `Too many failed attempts. Please wait ${check.remainingSeconds}s before trying again.`,
              `هەوڵی هەڵەی زۆر. تکایە ${check.remainingSeconds} چرکە چاوەڕێ بکە پێش دووبارە هەوڵدان.`
            )
          );
        } else {
          setAdminPinError(
            bi(
              'رمز PIN للمدير غير صحيح.',
              'Invalid Staff Admin PIN.',
              'کۆدی PINـی بەڕێوەبەر هەڵەیە.'
            )
          );
        }
        return;
      }
      const matchedStaff =
        staffRoster.find((s) => s.role === 'admin') || staffRoster[0];
      const updated = ClinicOperationsService.setActiveStaff(matchedStaff.id);
      setActiveRole(updated.role);
      setPendingAdminRole(null);
      setAdminPinAttempt('');
      setAdminPinError(null);
    } finally {
      setAdminPinSubmitting(false);
    }
  };

  const handleConfirmFirstRunPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (firstRunPinSaving) return;
    if (firstRunPin.trim().length < 4) {
      setFirstRunPinError(
        bi(
          'يجب أن لا يقل الرمز عن 4 خانات.',
          'PIN must be at least 4 characters.',
          'کۆدەکە دەبێت لانیکەم ٤ پیت یان ژمارە بێت.'
        )
      );
      return;
    }
    if (firstRunPin !== firstRunPinConfirm) {
      setFirstRunPinError(
        bi(
          'رمزا PIN غير متطابقين.',
          'Admin PIN confirmation does not match.',
          'دوو کۆدەکەی PIN یەکناگرنەوە.'
        )
      );
      return;
    }
    setFirstRunPinSaving(true);
    setFirstRunPinError(null);
    try {
      await ClinicOperationsService.setAdminPinAsync(firstRunPin);
      setShowFirstRunPinModal(false);
      setFirstRunPin('');
      setFirstRunPinConfirm('');
    } catch (err: unknown) {
      setFirstRunPinError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل حفظ رمز المدير.',
              'Failed to save Admin PIN.',
              'پاشەکەوتکردنی کۆدی بەڕێوەبەر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setFirstRunPinSaving(false);
    }
  };

  const roleLabelMap: Record<string, { ar: string; en: string; ckb: string }> = {
    admin: { ar: 'المدير', en: 'Admin', ckb: 'بەڕێوەبەر' },
    senior_pt: { ar: 'أخصائي أقدم', en: 'Senior PT', ckb: 'پسپۆڕی باڵا' },
    assistant_pt: { ar: 'معالج', en: 'Therapist', ckb: 'چارەسەرکار' },
  };
  const userMenuRoleLabel = isSoloMode
    ? bi('معالج منفرد', 'Solo Mode', 'چارەسەرکاری تاک')
    : bi(
        roleLabelMap[activeRole]?.ar ?? 'الاستقبال',
        roleLabelMap[activeRole]?.en ?? 'Reception',
        roleLabelMap[activeRole]?.ckb ?? 'پێشوازی'
      );

  const mobileTopTitle = (() => {
    switch (activeNav) {
      case 'today':
        return bi('اليوم', 'Today', t('navToday'));
      case 'reception':
        return bi('الاستقبال', 'Reception', t('navReception'));
      case 'schedule':
        return bi('المواعيد', 'Schedule', t('navSchedule'));
      case 'directory':
        return bi('المرضى', 'Patients', t('navPatients'));
      case 'finance':
        return bi('الحسابات', 'Finance', t('navFinance'));
      case 'exercises':
        return bi('التمارين (HEP)', 'Exercises', t('navHep'));
      case 'analytics':
        return t('analytics.nav');
      case 'activity_log':
        return bi('سجل النشاط', 'Activity', t('navAudit'));
    }
  })();

  const isAnyModalOpen =
    isGlobalSearchOpen ||
    isPatientModalOpen ||
    Boolean(mergeModalExistingPatientId) ||
    isBackupModalOpen ||
    isSeedModalOpen ||
    isSettingsModalOpen ||
    isMigrationModalOpen ||
    isKioskModalOpen ||
    isTourOpen ||
    isWelcomeOpen ||
    isRecoveryDrillOpen ||
    isPasswordReminderOpen ||
    showFirstRunModeWizard ||
    (!isSoloMode && showFirstRunPinModal) ||
    (!isSoloMode && Boolean(pendingAdminRole)) ||
    isMobileAccountMenuOpen;

  const currentPageTourId: PageTourId | null = (() => {
    if (isBackupModalOpen) return 'backup_restore';
    if (isSettingsModalOpen) return 'settings';
    if (selectedPatient) {
      return isPatientSessionActive ? 'session_soap' : 'patient_chart';
    }
    if (
      activeNav === 'today' ||
      activeNav === 'reception' ||
      activeNav === 'schedule' ||
      activeNav === 'directory' ||
      activeNav === 'finance' ||
      activeNav === 'exercises' ||
      activeNav === 'analytics' ||
      activeNav === 'activity_log'
    ) {
      return activeNav;
    }
    return null;
  })();

  const isBlockingOverlayForTour =
    isPrivacyCoverOpen ||
    isGlobalSearchOpen ||
    isPatientModalOpen ||
    Boolean(mergeModalExistingPatientId) ||
    isSeedModalOpen ||
    isMigrationModalOpen ||
    isKioskModalOpen ||
    isTourOpen ||
    isWelcomeOpen ||
    isRecoveryDrillOpen ||
    isPasswordReminderOpen ||
    showFirstRunModeWizard ||
    (!isSoloMode && showFirstRunPinModal) ||
    (!isSoloMode && Boolean(pendingAdminRole)) ||
    isMobileAccountMenuOpen;

  const hasAnyPatients = patients.length > 0;
  const walkthroughStages = React.useMemo(
    () => getFullAppWalkthroughStages(isSoloMode, hasAnyPatients),
    [isSoloMode, hasAnyPatients]
  );

  // Show the calm First-Entry Welcome & Platform Overview ONCE on initial entry (skipped under WebDriver)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    if (isWelcomeOpen || activeSpotlightTourId || fullWalkthroughStageIdx !== null) return;
    if (isBlockingOverlayForTour || isSettingsModalOpen || Boolean(selectedPatient)) return;
    if (!ClinicOperationsService.getOnboardingState().tipsEnabled) return;
    if (!shouldShowWelcomeOnboarding(pageToursState)) return;

    const timer = window.setTimeout(() => {
      setIsWelcomeOpen(true);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [
    isWelcomeOpen,
    activeSpotlightTourId,
    fullWalkthroughStageIdx,
    isBlockingOverlayForTour,
    isSettingsModalOpen,
    selectedPatient,
    pageToursState,
  ]);

  // Auto-trigger a calm first-visit spotlight tour ONCE per page/tab (after Welcome is seen, skipped under WebDriver)
  useEffect(() => {
    if (fullWalkthroughStageIdx !== null) {
      return;
    }
    if (!currentPageTourId) {
      setActiveSpotlightTourId(null);
      return;
    }
    if (isBlockingOverlayForTour) {
      return;
    }
    if (activeSpotlightTourId && activeSpotlightTourId !== currentPageTourId) {
      setActiveSpotlightTourId(null);
    }
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      return;
    }
    if (!pageToursState.welcomeSeen) {
      return;
    }
    if (!ClinicOperationsService.getOnboardingState().tipsEnabled) {
      return;
    }
    if (!shouldAutoTriggerPageTour(currentPageTourId, pageToursState)) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveSpotlightTourId(currentPageTourId);
    }, 620);
    return () => window.clearTimeout(timer);
  }, [
    fullWalkthroughStageIdx,
    currentPageTourId,
    isBlockingOverlayForTour,
    pageToursState,
    activeSpotlightTourId,
  ]);

  const applyWalkthroughStage = (stageIndex: number) => {
    const stage = walkthroughStages[stageIndex];
    if (!stage) return;
    setIsWelcomeOpen(false);
    setIsTourOpen(false);
    setActiveSpotlightTourId(null);

    if (stage.targetAction === 'settings_modal') {
      setSelectedSessionLaunch(null);
      setSelectedPatientId(null);
      setSettingsInitialTab('clinic');
      setIsSettingsModalOpen(true);
    } else if (stage.targetAction === 'patient_chart') {
      const targetPatient = selectedPatient ?? patients[0] ?? null;
      if (targetPatient) {
        setIsSettingsModalOpen(false);
        setSelectedSessionLaunch(null);
        setIsPatientSessionActive(false);
        window.dispatchEvent(new CustomEvent('physiorecord-chart-close-session'));
        setSelectedPatientId(targetPatient.id);
      } else {
        // Fallback safely if patients were cleared mid-walkthrough
        setIsSettingsModalOpen(false);
        setSelectedSessionLaunch(null);
        setSelectedPatientId(null);
        setActiveNav('directory');
      }
    } else if (stage.navTab) {
      setIsSettingsModalOpen(false);
      setSelectedSessionLaunch(null);
      setSelectedPatientId(null);
      setActiveNav(stage.navTab);
    }

    setFullWalkthroughStageIdx(stageIndex);
    window.setTimeout(() => {
      setActiveSpotlightTourId(stage.pageId);
    }, stage.targetAction === 'patient_chart' ? 320 : 260);
  };

  const handleStartFullWalkthrough = () => {
    setPageToursState(markWelcomeSeen());
    applyWalkthroughStage(0);
  };

  const handleLaunchPageSpotlight = async (requestedPageId?: PageTourId): Promise<boolean> => {
    setFullWalkthroughStageIdx(null);
    const targetId = requestedPageId ?? currentPageTourId;
    if (!targetId || !PAGE_SPOTLIGHT_TOURS[targetId]) {
      setIsTourOpen(true);
      return false;
    }

    setIsWelcomeOpen(false);
    setActiveSpotlightTourId(null);

    if (targetId === 'settings') {
      setIsBackupModalOpen(false);
      setIsTourOpen(false);
      setSettingsInitialTab('clinic');
      setIsSettingsModalOpen(true);
    } else if (targetId === 'backup_restore') {
      setIsSettingsModalOpen(false);
      setIsTourOpen(false);
      setIsBackupModalOpen(true);
    } else if (targetId === 'patient_chart') {
      const targetPatient = selectedPatient ?? patients[0] ?? null;
      if (!targetPatient) {
        return false;
      }
      setIsTourOpen(false);
      setIsSettingsModalOpen(false);
      setIsBackupModalOpen(false);
      setSelectedSessionLaunch(null);
      setIsPatientSessionActive(false);
      window.dispatchEvent(new CustomEvent('physiorecord-chart-close-session'));
      setSelectedPatientId(targetPatient.id);
    } else if (targetId === 'session_soap') {
      if (selectedPatient && isPatientSessionActive) {
        setIsTourOpen(false);
        setIsSettingsModalOpen(false);
        setIsBackupModalOpen(false);
      } else {
        if (!dek || patients.length === 0) {
          return false;
        }
        const candidates = selectedPatient
          ? [selectedPatient, ...patients.filter((p) => p.id !== selectedPatient.id)]
          : patients;
        let foundTarget: { patientId: string; sessionId: string } | null = null;
        for (const cand of candidates) {
          try {
            const eps = await EpisodeService.getEpisodesByPatient(cand.id, dek);
            let latestFallback: { patientId: string; sessionId: string } | null = null;
            for (const ep of eps) {
              const sessList = await SessionService.getSessionsByEpisode(ep.id, dek);
              const draft = sessList.find((s) => s.data.status === 'draft');
              if (draft) {
                foundTarget = { patientId: cand.id, sessionId: draft.id };
                break;
              }
              if (!latestFallback && sessList.length > 0) {
                latestFallback = { patientId: cand.id, sessionId: sessList[0].id };
              }
            }
            if (!foundTarget && latestFallback) {
              foundTarget = latestFallback;
            }
            if (foundTarget) break;
          } catch {
            // Skip any candidate that cannot be inspected
          }
        }
        if (!foundTarget) {
          return false;
        }
        setIsTourOpen(false);
        setIsSettingsModalOpen(false);
        setIsBackupModalOpen(false);
        setSelectedPatientId(foundTarget.patientId);
        setSelectedSessionLaunch({ sessionId: foundTarget.sessionId });
      }
    } else if (
      targetId === 'today' ||
      targetId === 'reception' ||
      targetId === 'schedule' ||
      targetId === 'directory' ||
      targetId === 'finance'
    ) {
      setIsTourOpen(false);
      setIsSettingsModalOpen(false);
      setIsBackupModalOpen(false);
      setSelectedSessionLaunch(null);
      setSelectedPatientId(null);
      setActiveNav(targetId);
    } else {
      setIsTourOpen(false);
    }

    window.setTimeout(() => {
      setActiveSpotlightTourId(targetId);
    }, targetId === 'session_soap' ? 420 : 280);
    return true;
  };

  const handleStartPatientChartTourWithDemo = async () => {
    setFullWalkthroughStageIdx(null);
    setIsTourOpen(false);
    setIsWelcomeOpen(false);
    await handleLoadTourDemoData();
    const firstDemoId = SYNTHETIC_PATIENTS[0]?.id ?? null;
    if (firstDemoId) {
      setIsSettingsModalOpen(false);
      setIsBackupModalOpen(false);
      setSelectedSessionLaunch(null);
      setSelectedPatientId(firstDemoId);
      window.setTimeout(() => {
        setActiveSpotlightTourId('patient_chart');
      }, 360);
    }
  };

  const handleStartSessionSoapTourWithDemo = async () => {
    setFullWalkthroughStageIdx(null);
    setIsTourOpen(false);
    setIsWelcomeOpen(false);
    await handleLoadTourDemoData();
    const firstDemoId = SYNTHETIC_PATIENTS[0]?.id ?? null;
    if (!firstDemoId || !dek) return;
    try {
      let eps = await EpisodeService.getEpisodesByPatient(firstDemoId, dek);
      let activeEp = eps.find((e) => e.data.status === 'active') ?? eps[0];
      if (!activeEp) {
        activeEp = await EpisodeService.createEpisode(
          firstDemoId,
          {
            title: bi(
              'تأهيل أسفل الظهر (تجريبي DEMO)',
              'Lumbar Rehab Episode (DEMO)',
              'چارەسەری خوارەوەی پشت (تاقیکاری DEMO)'
            ),
            status: 'active',
            primarySpecialty: 'musculoskeletal',
            startDate: localDate(),
            medicalDiagnosis: bi(
              'ألم أسفل الظهر الميكانيكي (DEMO)',
              'Mechanical Low Back Pain (DEMO)',
              'ئازاری میکانیکیی خوارەوەی پشت (DEMO)'
            ),
            clinicalImpression: bi(
              'تيبّس قطني مع ضعف عضلات الجذع العميقة — ملف تجريبي للشرح',
              'Lumbar stiffness with core weakness — temporary DEMO tour record',
              'گرژیی خوارەوەی پشت — دۆسیەی تاقیکاری بۆ ڕوونکردنەوە'
            ),
            affectedBodyRegion: bi('أسفل الظهر (قطني)', 'Lumbar Spine', 'خوارەوەی پشت'),
            rehabilitationGoals: {
              shortTerm: [
                bi('تخفيف الألم الصباحي (تجريبي DEMO)', 'Reduce morning pain (DEMO)', 'کەمکردنەوەی ئازار (DEMO)'),
              ],
              longTerm: [
                bi('العودة للنشاط اليومي بدون ألم (DEMO)', 'Return to pain-free daily activity (DEMO)', 'گەڕانەوە بۆ چالاکی ڕۆژانە (DEMO)'),
              ],
            },
          },
          dek
        );
      }
      const existingSessions = await SessionService.getSessionsByEpisode(activeEp.id, dek);
      let targetSession = existingSessions.find((s) => s.data.status === 'draft') ?? existingSessions[0];
      if (!targetSession) {
        targetSession = await SessionService.createSession(
          firstDemoId,
          activeEp.id,
          {
            sessionDate: localDate(),
            sessionType: 'initial_evaluation',
            status: 'draft',
            attendanceStatus: 'attended',
          },
          dek
        );
      }
      setIsSettingsModalOpen(false);
      setIsBackupModalOpen(false);
      setSelectedPatientId(firstDemoId);
      setSelectedSessionLaunch({ sessionId: targetSession.id });
      window.setTimeout(() => {
        setActiveSpotlightTourId('session_soap');
      }, 480);
    } catch (err) {
      console.error('Failed to prepare DEMO SOAP session tour:', err);
    }
  };

  const handleCloseSpotlightTour = (wasDisplayed: boolean = true) => {
    if (fullWalkthroughStageIdx !== null) {
      if (!wasDisplayed) {
        setFullWalkthroughStageIdx(null);
        setActiveSpotlightTourId(null);
        return;
      }
      const visitedIds = walkthroughStages
        .slice(0, fullWalkthroughStageIdx + 1)
        .map((s) => s.pageId);
      if (fullWalkthroughStageIdx === walkthroughStages.length - 1) {
        setPageToursState(markFullTourCompleted(visitedIds));
      } else {
        let updated = markWelcomeSeen();
        for (const id of visitedIds) {
          updated = markPageTourSeen(id);
        }
        setPageToursState(updated);
      }
      if (isSettingsModalOpen) {
        setIsSettingsModalOpen(false);
      }
      setSelectedSessionLaunch(null);
      setSelectedPatientId(null);
      setActiveNav(isSoloMode ? 'today' : 'reception');
      setFullWalkthroughStageIdx(null);
      setActiveSpotlightTourId(null);
      return;
    }

    if (wasDisplayed && activeSpotlightTourId) {
      setPageToursState(markPageTourSeen(activeSpotlightTourId));
    }
    setActiveSpotlightTourId(null);
  };

  const handleDisableAutoSpotlightTours = () => {
    if (activeSpotlightTourId) {
      markPageTourSeen(activeSpotlightTourId);
    }
    markWelcomeSeen();
    setPageToursState(setAutoPageToursEnabled(false));
    void ClinicOperationsService.setTipsEnabledAsync(false);
    setFullWalkthroughStageIdx(null);
    setActiveSpotlightTourId(null);
  };

  return (
    <div
      className="relative flex h-dvh w-screen overflow-hidden bg-background-1 text-foreground"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Desktop Slim Collapsible Rail (68px <-> 224px, hidden on < md and auto-hidden in Session Focus Mode) */}
      <div className={isPrivacyCoverOpen ? 'filter blur-md pointer-events-none select-none' : ''}>
        <Sidebar
          isFocusMode={isSessionFocusMode}
          activeNav={activeNav}
          onSelectNav={(nav) => {
            setSelectedSessionLaunch(null);
            setSelectedPatientId(null);
            setActiveNav(nav);
          }}
          selectedPatient={selectedPatient}
          onSelectPatient={handleSelectPatient}
          showExerciseLibrary={showExerciseLibrary}
          showAnalyticsModule={showAnalyticsModule}
          isSoloMode={isSoloMode}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          onNewPatient={handleOpenNewPatient}
          onBookAppointment={handleQuickBookAppointment}
          onNewInvoice={handleQuickNewInvoice}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onOpenDemoModal={() => setIsSeedModalOpen(true)}
          onSwitchWorkspaceMode={(mode) => void ClinicOperationsService.switchWorkspaceModeAsync(mode)}
          onOpenTour={() => setIsTourOpen(true)}
          onOpenPrivacyCover={() => setIsPrivacyCoverOpen(true)}
          onLockVault={lock}
          onOpenKiosk={() => setIsKioskModalOpen(true)}
          enableKioskModule={enableKioskModule}
          canInstallPwa={pwa.canInstallPrompt}
          onInstallPwa={() => void triggerPwaInstallPrompt()}
          activeRole={activeRole}
          staffRoster={staffRoster}
          onSwitchRole={handleQuickRoleSwitch}
          userMenuRoleLabel={userMenuRoleLabel}
          formattedLastBackup={formattedLastBackup}
          isBackupOverdue={isBackupOverdue}
          hasDemoRecords={hasDemoRecords}
        />
      </div>

      {/* Main Fluid Workspace Canvas */}
      <main
        className={`relative flex-1 min-w-0 flex flex-col h-dvh overflow-hidden pr-main-canvas ${
          isPrivacyCoverOpen ? 'filter blur-md pointer-events-none select-none' : ''
        }`}
      >
        {/* Minimal Mobile Top Strip (< md, hidden inside Patient Chart / Session Focus Mode) */}
        {!selectedPatient && !isSessionFocusMode && (
          <header
            data-testid="mobile-top-strip"
            className="md:hidden relative z-30 shrink-0 px-3.5 pt-[env(safe-area-inset-top,0px)] h-[calc(52px+env(safe-area-inset-top,0px))] flex items-center justify-between gap-2 bg-card/85 backdrop-blur-md border-b border-line-2/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BrandLogo className="size-7 text-primary shrink-0" />
              <span className="text-sm font-extrabold text-foreground truncate">
                {mobileTopTitle}
              </span>
              {hasDemoRecords && (
                <button
                  type="button"
                  data-testid="manage-demo-data-strip-btn"
                  onClick={() => setIsSeedModalOpen(true)}
                  className="min-h-[44px] inline-flex items-center p-0 bg-transparent border-0 shrink-0 cursor-pointer"
                  aria-label={bi('إدارة بيانات العرض', 'Manage Demo Data', 'بەڕێوەبردنی داتای پیشاندان')}
                >
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/12 border border-amber-500/25 inline-flex items-center">
                    <DemoBadge />
                  </span>
                </button>
              )}
            </div>

            <div className="relative shrink-0">
              <button
                ref={mobileAccountBtnRef}
                type="button"
                data-testid="mobile-account-btn"
                aria-haspopup="dialog"
                aria-expanded={isMobileAccountMenuOpen}
                onClick={() => setIsMobileAccountMenuOpen((prev) => !prev)}
                aria-label={bi('قائمة العيادة والإعدادات', 'Clinic & Account Menu', 'مێنووی کلینیک و هەژمار')}
                className="relative size-11 rounded-xl hover:bg-surface inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <span className="size-8 rounded-full bg-primary/12 text-primary inline-flex items-center justify-center">
                  <User className="size-4" />
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute top-2 end-2 size-2 rounded-full ring-2 ring-card ${
                    isBackupOverdue || hasDemoRecords ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </button>

              <AccountMenuPopover
                isOpen={isMobileAccountMenuOpen}
                onClose={() => setIsMobileAccountMenuOpen(false)}
                placement="mobile-top"
                triggerRef={mobileAccountBtnRef}
                userMenuRoleLabel={userMenuRoleLabel}
                isSoloMode={isSoloMode}
                activeRole={activeRole}
                staffRoster={staffRoster}
                onSwitchRole={handleQuickRoleSwitch}
                onSwitchWorkspaceMode={(mode) =>
                  void ClinicOperationsService.switchWorkspaceModeAsync(mode)
                }
                formattedLastBackup={formattedLastBackup}
                isBackupOverdue={isBackupOverdue}
                hasDemoRecords={hasDemoRecords}
                onOpenBackup={() => setIsBackupModalOpen(true)}
                onOpenDemoModal={() => setIsSeedModalOpen(true)}
                onOpenPrivacyCover={() => setIsPrivacyCoverOpen(true)}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenTour={() => setIsTourOpen(true)}
                onOpenKiosk={() => setIsKioskModalOpen(true)}
                enableKioskModule={enableKioskModule}
                canInstallPwa={pwa.canInstallPrompt}
                onInstallPwa={() => void triggerPwaInstallPrompt()}
                showExerciseLibrary={showExerciseLibrary}
                showAnalyticsModule={showAnalyticsModule}
                onSelectSecondaryNav={(nav) => {
                  setSelectedSessionLaunch(null);
                  setSelectedPatientId(null);
                  setActiveNav(nav);
                }}
                onLockVault={lock}
              />
            </div>
          </header>
        )}

        {/* Phase F4: Compact Public Demo Mode Banner */}
        {isPublicDemoActive && (
          <div
            data-testid="public-demo-mode-banner"
            className="px-3 sm:px-5 py-1.5 bg-amber-800 text-white border-b border-amber-900 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-20"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 font-extrabold">
              <span className="px-2 py-0.5 rounded bg-black/30 text-white font-mono text-xs shrink-0">
                <bdi dir="ltr">DEMO · CC0-1.0</bdi>
              </span>
              <span className="truncate sm:whitespace-normal">
                {bi(
                  'وضع العرض التجريبي العام (DEMO) — يحتوي هذا العرض على بيانات عراقية افتراضية فقط (CC0-1.0) ولا يُستخدم لبيانات المرضى الحقيقية.',
                  'PUBLIC DEMO BUILD — Contains synthetic Iraqi demonstration data only (CC0-1.0). Do not enter real patient PHI.',
                  'دۆخی پیشاندانی گشتی (DEMO) — تەنها داتای تاقیکردنەوەی عێراقی تێدایە (CC0-1.0) و بۆ زانیاریی ڕاستەقینەی نەخۆش بەکارنایەت.'
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="public-demo-manage-btn"
                onClick={() => setIsSeedModalOpen(true)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white text-amber-950 hover:bg-amber-50 text-xs font-extrabold cursor-pointer whitespace-nowrap"
              >
                {bi('إدارة بيانات العرض', 'Manage Demo Data', 'بەڕێوەبردنی داتای پیشاندان')}
              </button>
              <button
                type="button"
                data-testid="exit-public-demo-mode-btn"
                onClick={() => {
                  ClinicOperationsService.setPublicDemoModeEnabled(false);
                  setIsPublicDemoActive(isPublicDemoUrlOrEnv());
                  window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
                }}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black/30 hover:bg-black/45 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {bi('إنهاء وضع العرض', 'Exit Demo Mode', 'دەرچوون لە دۆخی پیشاندان')}
              </button>
            </div>
          </div>
        )}

        {/* PWA Update Available Banner (1.8) */}
        <RecoveredWorkBanner
          drafts={recoveredDrafts}
          onRestoreDraft={handleRestoreRecoveredDraft}
          onDiscardDraft={(id) => void dismissRecoveredDraft(id)}
          onDiscardAll={() => void clearAllRecoveredDrafts()}
        />

        {/* Phase A4: Quarterly Dismissible Recovery Drill Banner (Shown on main clinic views, hidden inside active patient chart) */}
        {isRecoveryDrillDue && !selectedPatient && (
          <div
            data-testid="recovery-drill-banner"
            className="relative z-10 px-3 sm:px-5 py-1.5 bg-primary/10 border-b border-primary/25 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 font-semibold">
              <Database className="size-4 text-primary shrink-0" />
              <span className="truncate">
                {bi(
                  'تذكير ربع سنوي: اختبر جاهزية مفتاح الاسترداد والنسخة الاحتياطية في بيئة معزولة',
                  'Quarterly check: Verify your Recovery Key & test your latest backup in a sandbox',
                  'بیرخستنەوەی وەرزی: کلیلی گەڕاندنەوە و فایلە پاشەکەوتەکەت تاقی بکەرەوە'
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsRecoveryDrillOpen(true)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {bi('بدء الاختبار', 'Test Now', 'ئێستا تاقی بکەرەوە')}
              </button>
              <button
                type="button"
                onClick={() => snoozeRecoveryDrillBanner(14)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-semibold cursor-pointer"
                aria-label={bi('تذكيري لاحقاً', 'Remind later', 'دواتر بیرم بخەرەوە')}
              >
                {bi('لاحقاً', 'Dismiss', 'لابردن')}
              </button>
            </div>
          </div>
        )}

        {/* Signal-Style Spaced-Repetition Password Memory Check Banner (Shown only when due & no other security banner is active) */}
        {isPasswordReminderDueNow && !isRecoveryDrillDue && !selectedPatient && (
          <div
            data-testid="password-memory-reminder-banner"
            className="relative z-10 px-3 sm:px-5 py-1.5 bg-primary/10 border-b border-primary/25 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 font-semibold">
              <KeyRound className="size-4 text-primary shrink-0" />
              <span className="truncate">
                {bi(
                  'تذكير لطيف لتثبيت كلمة المرور: تأكد من تذكّرك لها الآن وخزينتك مفتوحة بأمان',
                  'Gentle password check: Confirm your master password while unlocked so you never lose access',
                  'بیرخستنەوەی وشەی نهێنی: ئێستا وشەی نهێنیت دڵنیا بکەرەوە لە کاتێکدا خەزێنە کراوەیە'
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="password-reminder-banner-open-btn"
                onClick={() => setIsPasswordReminderOpen(true)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {bi('تأكيد الآن', 'Verify Now', 'ئێستا دڵنیای بکەرەوە')}
              </button>
              <button
                type="button"
                onClick={() => snoozePasswordReminder(2)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-semibold cursor-pointer"
                aria-label={bi('تذكيري لاحقاً', 'Remind later', 'دواتر بیرم بخەرەوە')}
              >
                {bi('لاحقاً', 'Later', 'دواتر')}
              </button>
            </div>
          </div>
        )}

        {pwa.updateReady && (
          <div className="relative z-10 px-3 sm:px-5 py-1.5 bg-primary/15 border-b border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0">
            <div className="flex items-center gap-2 font-semibold">
              <RefreshCw className="w-4 h-4 text-primary shrink-0" />
              <span>
                {bi(
                  'يتوفر إصدار محدّث من النظام جاهز للتفعيل دون اتصال.',
                  'An updated offline build is ready to activate.',
                  'وەشانی نوێی سیستەم ئامادەیە بۆ کارپێکردن بەبێ ئینتەرنێت.'
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="pwa-banner-backup-first-btn"
                onClick={() => setIsBackupModalOpen(true)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold cursor-pointer"
              >
                {bi('نسخ احتياطي أولاً', 'Back Up First', 'کۆپی یەدەگ سەرەتا')}
              </button>
              <button
                type="button"
                data-testid="pwa-banner-reload-update-btn"
                onClick={applyPwaUpdate}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('تحديث وإعادة التحميل', 'Reload to Update', 'نوێکردنەوە و بارکردنەوە')}
              </button>
            </div>
          </div>
        )}

        {/* In-App GitHub Release Update Notification Banner */}
        {pendingGithubUpdate && !pwa.updateReady && (
          <div
            data-testid="github-update-notification-banner"
            className="relative z-10 px-3 sm:px-5 py-2 bg-emerald-500/12 border-b border-emerald-500/25 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 font-semibold">
              <Download className="size-4 text-primary shrink-0" />
              <span className="truncate sm:whitespace-normal">
                {bi(
                  `يتوفر تحديث جديد للتطبيق (${pendingGithubUpdate.tagName}) على GitHub — بياناتك المحلية محفوظة بالكامل.`,
                  `New app update (${pendingGithubUpdate.tagName}) is available on GitHub — your local data stays intact.`,
                  `نوێکردنەوەیەکی نوێی بەرنامە (${pendingGithubUpdate.tagName}) لە گیتهەب بەردەستە — داتاکانت پارێزراون.`
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="github-update-banner-details-btn"
                onClick={() => {
                  setSettingsInitialTab('security');
                  setIsSettingsModalOpen(true);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {bi('التفاصيل والتحديث', 'Update Details', 'وردەکاری و نوێکردنەوە')}
              </button>
              <button
                type="button"
                data-testid="dismiss-github-update-banner-btn"
                onClick={() => {
                  dismissUpdateTag(pendingGithubUpdate.tagName);
                  setPendingGithubUpdate(null);
                }}
                aria-label={bi('إخفاء إشعار التحديث', 'Dismiss update notification', 'شاردنەوەی ئاگاداری نوێکردنەوە')}
                className="size-8 rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* iOS Safari Add-to-Home-Screen Installation Guidance (1.8) */}
        {pwa.isIosSafariInstallEligible && !iosInstallDismissed && (
          <div className="relative z-10 px-3 sm:px-5 py-1.5 bg-surface border-b border-card-divider flex items-center justify-between gap-2 text-xs text-foreground shrink-0">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary shrink-0" />
              <span>
                {bi(
                  'لتثبيت التطبيق على iPhone/iPad للعمل دون إنترنت: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».',
                  'To install on iPhone/iPad for offline durability: tap Share, then "Add to Home Screen".',
                  'بۆ دامەزراندنی بەرنامەکە لەسەر iPhone/iPad بەبێ ئینتەرنێت: دوگمەی هاوبەشکردن دابگرە پاشان «زیادکردن بۆ شاشەی سەرەکی».'
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIosInstallDismissed(true)}
              aria-label={bi('إخفاء', 'Dismiss', 'شاردنەوە')}
              className="size-9 rounded-lg hover:bg-layer-hover inline-flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Phase 1.3: Dismissible Legacy Migration Warning -> Review & Resolve Modal */}
        {!migrationBannerDismissed && unmigratedCount > 0 && (
          <div className="relative z-10 px-3 sm:px-5 py-1.5 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-bold truncate sm:whitespace-normal">
                  {bi(
                    `تحذير ترحيل البيانات: (${unmigratedCount}) سجل قديم يتطلب المراجعة.`,
                    `Migration notice: (${unmigratedCount}) legacy item(s) could not be auto-migrated.`,
                    `ئاگاداری گواستنەوەی داتا: (${unmigratedCount}) تۆماری کۆن پێویستی بە پێداچوونەوەیە.`
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setIsMigrationModalOpen(true)}
                  className="min-h-[34px] px-2.5 py-1 rounded-full bg-card/75 hover:bg-card text-amber-800 dark:text-amber-300 text-xs font-extrabold cursor-pointer shrink-0 shadow-2xs"
                >
                  {bi('مراجعة ومعالجة', 'Review & resolve', 'پێداچوونەوە و چارەسەرکردن')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMigrationBannerDismissed(true)}
                aria-label={bi('إغلاق تحذير الترحيل', 'Dismiss migration warning', 'داخستنی ئاگاداری گواستنەوە')}
                className="size-8 rounded-full hover:bg-card/60 inline-flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Startup Clinical Integrity Repair / Error Banner */}
        {(repairError ||
          (lastRepairSummary &&
            (lastRepairSummary.repairedCount > 0 || lastRepairSummary.skippedCount > 0))) && (
          <div
            className={`relative z-10 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2.5 text-xs shrink-0 ${
              repairError
                ? 'text-rose-700 dark:text-rose-300'
                : 'text-amber-800 dark:text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  repairError
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              />
              <span className="font-bold">
                {repairError
                  ? repairError
                  : bi(
                      `تم فحص وتحديث فحوصات النزاهة السريرية المحلية لـ (${lastRepairSummary?.repairedCount ?? 0}) جلسة مغلقة (فحص محلي وليس توقيعاً إلكترونياً قانونياً).`,
                      `Verified local clinical integrity checks for (${lastRepairSummary?.repairedCount ?? 0}) finalized session(s) (not a legal electronic signature).`,
                      `پشکنینی دروستیی کلینیکی ناوخۆیی بۆ (${lastRepairSummary?.repairedCount ?? 0}) دانیشتنی داخراو ئەنجامدرا (پشکنینی ناوخۆییە و واژۆی ئەلیکترۆنی یاسایی نییە).`
                    )}
              </span>
            </div>
            <button
              type="button"
              onClick={dismissRepairNotice}
              aria-label={bi('إخفاء التنبيه', 'Dismiss', 'شاردنەوە')}
              className="size-9 rounded-lg hover:bg-amber-200/60 dark:hover:bg-amber-800/50 text-amber-900 dark:text-amber-200 inline-flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Active View Router */}
        {selectedPatient ? (
          <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center p-8 text-xs text-muted-foreground-1">
                  {bi('جاري فتح الملف السريري...', 'Loading patient workspace...')}
                </div>
              }
            >
              <PatientWorkspace
                patient={selectedPatient}
                onBackToDirectory={() => {
                  setSelectedSessionLaunch(null);
                  setSelectedPatientId(null);
                }}
                initialSessionId={selectedSessionLaunch?.sessionId}
                initialAutoOpenFinish={selectedSessionLaunch?.autoOpenFinish}
                onFocusModeChange={setIsSessionFocusMode}
                onActiveSessionChange={setIsPatientSessionActive}
                onFinishCompleted={(snap, summaryAr, summaryEn) =>
                  triggerFinishUndoToast(snap, bi(summaryAr, summaryEn))
                }
                onStartChartTour={() => void handleLaunchPageSpotlight('patient_chart')}
                onStartSessionTour={() => void handleLaunchPageSpotlight('session_soap')}
              />
            </Suspense>
          </div>
        ) : (
          <div
            tabIndex={0}
            aria-label={bi('المحتوى الرئيسي', 'Main workspace content', 'ناوەڕۆکی سەرەکی')}
            className="relative z-10 flex-1 overflow-y-auto focus:outline-none"
          >
            <div className="app-content-shell">
            <Suspense
              fallback={
                <div className="p-8 text-center text-xs text-muted-foreground-1">
                  {bi('جاري تحميل القسم...', 'Loading view...')}
                </div>
              }
            >
            {activeNav === 'today' && (
              <TodayCommandView
                requestedSubTab={todaySubTabRequest}
                onOpenPatientSession={(patient, sessionId, autoOpenFinish) => {
                  setSelectedSessionLaunch(
                    sessionId ? { sessionId, autoOpenFinish } : null
                  );
                  setSelectedPatientId(patient.id);
                }}
                onOpenNewPatient={handleOpenNewPatient}
                onOpenBackup={() => setIsBackupModalOpen(true)}
                onOpenTour={() => setIsTourOpen(true)}
                onOpenSettingsTab={(tab) => {
                  setSettingsInitialTab(tab);
                  setIsSettingsModalOpen(true);
                }}
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
                onOpenRecoveryDrill={() => setIsRecoveryDrillOpen(true)}
                onOpenNewPatientModal={() => {
                  setPatientToEdit(null);
                  setIsPatientModalOpen(true);
                }}
              />
            )}

            {activeNav === 'reception' && (
              <ReceptionCommandCenterView
                onOpenPatient={(patientId) => setSelectedPatientId(patientId)}
                onNewPatient={handleOpenNewPatient}
                onNavigateTab={(tab) => setActiveNav(tab)}
              />
            )}

            {activeNav === 'directory' && (
              <PatientDirectory
                onSelectPatient={handleSelectPatient}
                onOpenNewPatientModal={handleOpenNewPatient}
                onOpenSyntheticModal={() => setIsSeedModalOpen(true)}
              />
            )}

            {activeNav === 'schedule' && (
              <AppointmentScheduleView
                onNewPatient={handleOpenNewPatient}
                quickBookingNonce={quickBookingNonce}
              />
            )}

            {activeNav === 'finance' && (
              <IraqiFinancialLedgerView quickInvoiceNonce={quickInvoiceNonce} />
            )}

            {showExerciseLibrary && activeNav === 'exercises' && <ExerciseLibraryHepView />}

            {showAnalyticsModule && activeNav === 'analytics' && <LocalAnalyticsView />}

            {activeNav === 'activity_log' && (
              <ActivityLogView onRoleChanged={(staff) => setActiveRole(staff.role)} />
            )}
            </Suspense>

            <footer className="py-5 pb-20 md:pb-6 px-6 text-center text-xs text-muted-foreground-2/85 mt-6">
              {bi(
                'بياناتك مشفرة ومحفوظة على هذا الجهاز فقط',
                'Your data is encrypted and stored on this device only'
              )}
            </footer>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Auto-Hiding Floating Pill Dock (< md, hidden inside Focus Mode / Chart / Modals) */}
      <MobileFloatingDock
        isHidden={
          isSessionFocusMode ||
          Boolean(selectedPatient) ||
          isPrivacyCoverOpen ||
          isAnyModalOpen
        }
        isSoloMode={isSoloMode}
        activeNav={activeNav}
        hasAttentionDot={isBackupOverdue || hasDemoRecords}
        onSelectNav={(nav) => {
          setSelectedSessionLaunch(null);
          setSelectedPatientId(null);
          setActiveNav(nav);
        }}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        onNewPatient={handleOpenNewPatient}
        onBookAppointment={handleQuickBookAppointment}
        onNewInvoice={handleQuickNewInvoice}
      />

      {/* Global Command Palette & Arabic-Aware Patient Search (Ctrl/Cmd+K) */}
      <CommandPalette
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        query={globalSearchQuery}
        onQueryChange={setGlobalSearchQuery}
        highlightIdx={commandHighlightIdx}
        onHighlightIdxChange={setCommandHighlightIdx}
        inputRef={globalSearchInputRef}
        filteredPatients={globalFilteredPatients}
        isSoloMode={isSoloMode}
        showExerciseLibrary={showExerciseLibrary}
        showAnalyticsModule={showAnalyticsModule}
        enableKioskModule={enableKioskModule}
        hasDemoRecords={hasDemoRecords}
        onOpenNewPatient={handleOpenNewPatient}
        onNavigate={(nav) => {
          setSelectedSessionLaunch(null);
          setSelectedPatientId(null);
          setActiveNav(nav);
        }}
        onOpenBookAppointment={handleQuickBookAppointment}
        onOpenNewInvoice={handleQuickNewInvoice}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenPrivacyCover={() => setIsPrivacyCoverOpen(true)}
        onOpenKiosk={() => setIsKioskModalOpen(true)}
        onOpenDemoModal={() => setIsSeedModalOpen(true)}
        onOpenFullWalkthrough={() => handleStartFullWalkthrough()}
        onOpenSpotlightTour={() => void handleLaunchPageSpotlight()}
        onOpenQuickGuide={() => setIsTourOpen(true)}
        onLockVault={lock}
        onSelectPatient={(patientId) => setSelectedPatientId(patientId)}
      />

      {/* Right-Side Slide-Over Sheets & Dialogs (Lazy-loaded on open) */}
      {isPatientModalOpen && (
        <Suspense fallback={null}>
          <PatientModal
            isOpen={isPatientModalOpen}
            onClose={() => setIsPatientModalOpen(false)}
            patientToEdit={patientToEdit}
            onSavedSuccess={(saved) => {
              if (!patientToEdit) {
                setSelectedPatientId(saved.id);
              }
            }}
            onOpenExistingPatient={(existingId) => {
              setIsPatientModalOpen(false);
              setPatientToEdit(null);
              setSelectedSessionLaunch(null);
              setSelectedPatientId(existingId);
            }}
            onRequestMergeWithExisting={(existingId) => {
              setIsPatientModalOpen(false);
              setPatientToEdit(null);
              setMergeModalExistingPatientId(existingId);
            }}
          />
        </Suspense>
      )}

      {mergeModalExistingPatientId && (
        <Suspense fallback={null}>
          <PatientMergeModal
            isOpen={true}
            onClose={() => setMergeModalExistingPatientId(null)}
            initialSurvivingPatientId={mergeModalExistingPatientId}
            onMerged={(survivingId) => {
              setMergeModalExistingPatientId(null);
              setSelectedSessionLaunch(null);
              setSelectedPatientId(survivingId);
            }}
          />
        </Suspense>
      )}

      {isBackupModalOpen && (
        <Suspense fallback={null}>
          <BackupRestoreModal
            isOpen={isBackupModalOpen}
            onClose={() => setIsBackupModalOpen(false)}
          />
        </Suspense>
      )}

      {isSeedModalOpen && (
        <Suspense fallback={null}>
          <SyntheticDataModal
            isOpen={isSeedModalOpen}
            onClose={() => setIsSeedModalOpen(false)}
          />
        </Suspense>
      )}

      {isSettingsModalOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            initialTab={settingsInitialTab}
            onOpenDemoModal={() => setIsSeedModalOpen(true)}
            onOpenBackupModal={() => {
              setIsSettingsModalOpen(false);
              setIsBackupModalOpen(true);
            }}
            onStartTour={() => {
              setIsSettingsModalOpen(false);
              window.setTimeout(() => {
                handleStartFullWalkthrough();
              }, 160);
            }}
          />
        </Suspense>
      )}

      {isMigrationModalOpen && (
        <Suspense fallback={null}>
          <MigrationResolutionModal
            isOpen={isMigrationModalOpen}
            onClose={() => setIsMigrationModalOpen(false)}
            onResolved={(remaining) => setUnmigratedCount(remaining)}
          />
        </Suspense>
      )}

      {/* 5.10 Locked Patient Kiosk Mode Modal */}
      {enableKioskModule && isKioskModalOpen && (
        <Suspense fallback={null}>
          <PatientKioskModal
            isOpen={isKioskModalOpen}
            onOpenChange={setIsKioskModalOpen}
          />
        </Suspense>
      )}

      {/* First-Run Workspace Mode Wizard (Phase 2.1: Solo vs Team) */}
      {showFirstRunModeWizard && (
        <Suspense fallback={null}>
          <FirstRunModeWizardModal
            isOpen={showFirstRunModeWizard}
            onCompletedSolo={() => {
              setShowFirstRunModeWizard(false);
              setIsSoloMode(true);
              setActiveNav('today');
              setShowFirstRunPinModal(false);
            }}
            onCompletedTeam={() => {
              setShowFirstRunModeWizard(false);
              setIsSoloMode(false);
              setActiveNav('reception');
              setShowFirstRunPinModal(
                ClinicOperationsService.requiresFirstRunAdminPinSetup()
              );
            }}
          />
        </Suspense>
      )}

      {/* First-Entry Welcome & Platform Philosophy Modal */}
      {isWelcomeOpen && (
        <Suspense fallback={null}>
          <WelcomeOnboardingModal
            isOpen={isWelcomeOpen}
            isSoloMode={isSoloMode}
            walkthroughCount={walkthroughStages.length}
            onStartFullWalkthrough={handleStartFullWalkthrough}
            onEnterWorkspaceWithAutoGuides={() => {
              setPageToursState(markWelcomeSeen());
              setIsWelcomeOpen(false);
            }}
            onOpenFullGuide={() => {
              setPageToursState(markWelcomeSeen());
              setIsWelcomeOpen(false);
              setIsTourOpen(true);
            }}
            onDisableAllAutoGuides={() => {
              markWelcomeSeen();
              setPageToursState(setAutoPageToursEnabled(false));
              void ClinicOperationsService.setTipsEnabledAsync(false);
              setIsWelcomeOpen(false);
            }}
          />
        </Suspense>
      )}

      {/* Unified Full Offline Guide & Tour Hub Modal (Desktop/Laptop vs Mobile/Phone) */}
      {isTourOpen && (
        <Suspense fallback={null}>
          <GuidedTourModal
            isOpen={isTourOpen}
            onOpenChange={setIsTourOpen}
            hasDemoData={hasDemoRecords}
            hasPatients={hasAnyPatients}
            onLoadDemoData={handleLoadTourDemoData}
            onDeleteAllDemoData={handleDeleteTourDemoData}
            isSoloMode={isSoloMode}
            currentPageTourId={currentPageTourId ?? undefined}
            onStartSpotlightTour={(pageId) => handleLaunchPageSpotlight(pageId)}
            onStartPatientChartTourWithDemo={handleStartPatientChartTourWithDemo}
            onStartSessionSoapTourWithDemo={handleStartSessionSoapTourWithDemo}
            onAddFirstPatient={handleOpenNewPatient}
            onStartFullWalkthrough={handleStartFullWalkthrough}
            onOpenWelcomeScreen={() => setIsWelcomeOpen(true)}
          />
        </Suspense>
      )}

      {/* Calm Spotlight Tour Overlay (Supports Both Full-App Walkthrough & Per-Page Auto Tours) */}
      {activeSpotlightTourId && !isBlockingOverlayForTour && (
        <Suspense fallback={null}>
          <SpotlightTourOverlay
            tour={PAGE_SPOTLIGHT_TOURS[activeSpotlightTourId]}
            walkthroughMeta={
              fullWalkthroughStageIdx !== null && walkthroughStages[fullWalkthroughStageIdx]
                ? {
                    stageIndex: fullWalkthroughStageIdx,
                    totalStages: walkthroughStages.length,
                    stageTitleAr: walkthroughStages[fullWalkthroughStageIdx].stageTitleAr,
                    stageTitleEn: walkthroughStages[fullWalkthroughStageIdx].stageTitleEn,
                    stageTitleCkb: walkthroughStages[fullWalkthroughStageIdx].stageTitleCkb,
                    hasPrevStage: fullWalkthroughStageIdx > 0,
                    hasNextStage: fullWalkthroughStageIdx < walkthroughStages.length - 1,
                    onPrevStage: () => applyWalkthroughStage(fullWalkthroughStageIdx - 1),
                    onNextStage: () => {
                      const curStage = walkthroughStages[fullWalkthroughStageIdx];
                      if (curStage) {
                        setPageToursState(markPageTourSeen(curStage.pageId));
                      }
                      applyWalkthroughStage(fullWalkthroughStageIdx + 1);
                    },
                  }
                : null
            }
            onStepChange={(step) => {
              if (step.chartTab) {
                window.dispatchEvent(
                  new CustomEvent('physiorecord-chart-select-tab', {
                    detail: { tab: step.chartTab },
                  })
                );
              }
              if (step.settingsTab) {
                window.dispatchEvent(
                  new CustomEvent('physiorecord-settings-select-tab', {
                    detail: { tab: step.settingsTab },
                  })
                );
              }
            }}
            onClose={handleCloseSpotlightTour}
            onDisableAutoTours={handleDisableAutoSpotlightTours}
            onOpenFullGuide={() => {
              if (fullWalkthroughStageIdx !== null) {
                setFullWalkthroughStageIdx(null);
              }
              setIsTourOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Global 8-Second Post-Finish Billing & Booking Undo Toast (Phase 2.4) */}
      {finishUndoToast && (
        <div
          role="status"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fixed bottom-16 md:bottom-5 inset-x-4 sm:inset-x-auto sm:end-5 z-50 max-w-md bg-card border-2 border-primary/40 shadow-2xl rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs"
        >
          <span className="font-bold text-foreground">{finishUndoToast.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                ClinicOperationsService.undoFinishSequenceBillingAndBooking(
                  finishUndoToast.snapshot
                );
                if (finishUndoTimerRef.current) {
                  clearTimeout(finishUndoTimerRef.current);
                  finishUndoTimerRef.current = null;
                }
                setFinishUndoToast(null);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>{bi('تراجع (الدفع/الموعد)', 'Undo Billing/Booking', 'پاشگەزبوونەوە (پارەدان/نۆرە)')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (finishUndoTimerRef.current) {
                  clearTimeout(finishUndoTimerRef.current);
                  finishUndoTimerRef.current = null;
                }
                setFinishUndoToast(null);
              }}
              aria-label={bi('إغلاق', 'Close', 'داخستن')}
              className="p-1.5 text-muted-foreground-1 hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* First-Run Mandatory Custom Admin PIN Setup Modal (Team Mode only per 1.1 / 2.1) */}
      <ModalDialog
        isOpen={!isSoloMode && !showFirstRunModeWizard && showFirstRunPinModal}
        onOpenChange={() => {}}
        isDismissable={false}
        isKeyboardDismissDisabled
        hideCloseButton
        role="alertdialog"
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        title={
          <span className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-primary-foreground">
            <KeyRound className="size-4 shrink-0" />
            <span>
              {bi(
                'إعداد رمز مدير التوثيق المخصص (مطلوب في التشغيل الأول)',
                'Set Custom Staff Admin PIN (First-Run Setup)',
                'ڕێکخستنی کۆدی تایبەتی بەڕێوەبەر (پێویستە لە یەکەم کارپێکردندا)'
              )}
            </span>
          </span>
        }
        ariaLabel={bi(
          'إعداد رمز مدير التوثيق المخصص (مطلوب في التشغيل الأول)',
          'Set Custom Staff Admin PIN (First-Run Setup)',
          'ڕێکخستنی کۆدی تایبەتی بەڕێوەبەر (پێویستە لە یەکەم کارپێکردندا)'
        )}
        className="bg-card border-card-line"
        bodyClassName="p-5 overflow-y-auto"
      >
          <form
            onSubmit={(e) => void handleConfirmFirstRunPin(e)}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'تم إلغاء الرموز الافتراضية نهائياً. أنشئ رمز PIN خاصاً بك (4 خانات على الأقل، دون 1234 أو 0000). يُستخدم هذا الرمز لنسبة التوثيق للكادر فقط وليس بديلاً عن كلمة المرور الرئيسية للخزينة.',
                'Default PINs are disabled. Create your own custom Admin PIN (4+ characters, excluding 1234/0000). Note: role switching is for staff attribution in logs, not security authentication.',
                'کۆدە بنەڕەتییەکان بە تەواوی ناچالاک کراون. کۆدی PINـی تایبەت بە خۆت دروست بکە (لانیکەم ٤ پیت/ژمارە، بێ 1234 یان 0000). تەنها بۆ تۆمارکردنی ستاف بەکاردێت.'
              )}
            </p>
            <div className="space-y-2.5">
              <input
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                autoFocus
                required
                minLength={4}
                maxLength={32}
                aria-label={bi('رمز PIN الجديد', 'New Admin PIN', 'کۆدی PINـی نوێ')}
                value={firstRunPin}
                onChange={(e) => {
                  setFirstRunPin(e.target.value);
                  setFirstRunPinError(null);
                }}
                placeholder={bi('رمز PIN الجديد (4+ خانات)', 'New Admin PIN (4+ chars)', 'کۆدی PINـی نوێ (٤+ خانە)')}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface border border-layer-line text-center text-base font-bold text-foreground placeholder:font-sans placeholder:text-sm focus:outline-none focus:border-primary ${firstRunPin ? 'font-mono tracking-widest' : 'font-sans'}`}
              />
              <input
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                required
                minLength={4}
                maxLength={32}
                aria-label={bi('تأكيد رمز PIN الجديد', 'Confirm New Admin PIN', 'دڵنیاکردنەوەی کۆدی PINـی نوێ')}
                value={firstRunPinConfirm}
                onChange={(e) => {
                  setFirstRunPinConfirm(e.target.value);
                  setFirstRunPinError(null);
                }}
                placeholder={bi('تأكيد رمز PIN الجديد', 'Confirm New Admin PIN', 'دڵنیاکردنەوەی کۆدی PINـی نوێ')}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface border border-layer-line text-center text-base font-bold text-foreground placeholder:font-sans placeholder:text-sm focus:outline-none focus:border-primary ${firstRunPinConfirm ? 'font-mono tracking-widest' : 'font-sans'}`}
              />
            </div>
            {firstRunPinError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                {firstRunPinError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={firstRunPinSaving}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {firstRunPinSaving
                  ? bi('جاري الحفظ والتشفير...', 'Saving...', 'پاشەکەوت دەکرێت و کۆد دەکرێت...')
                  : bi('حفظ رمز المدير المشفر', 'Save Encrypted Admin PIN', 'پاشەکەوتکردنی کۆدی کۆدکراوی بەڕێوەبەر')}
              </button>
            </div>
          </form>
      </ModalDialog>

      {/* Staff Admin PIN Verification Modal (Team Mode only) */}
      <ModalDialog
        isOpen={!isSoloMode && Boolean(pendingAdminRole)}
        onOpenChange={(open) => {
          if (!open) setPendingAdminRole(null);
        }}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        title={
          <span className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-primary-foreground">
            <KeyRound className="size-4 shrink-0" />
            <span>
              {bi(
                'تأكيد رمز المدير (Admin PIN)',
                'Enter Staff Admin PIN',
                'پشتڕاستکردنەوەی کۆدی بەڕێوەبەر (Admin PIN)'
              )}
            </span>
          </span>
        }
        ariaLabel={bi(
          'تأكيد رمز المدير (Admin PIN)',
          'Enter Staff Admin PIN',
          'پشتڕاستکردنەوەی کۆدی بەڕێوەبەر (Admin PIN)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        className="bg-card border-card-line max-w-sm"
        bodyClassName="p-5 overflow-y-auto"
      >
          <form
            onSubmit={(e) => void handleConfirmAdminPin(e)}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'يتطلب التبديل إلى صفة مدير العيادة إدخال رمز PIN المخصص (لأغراض نسبة التوثيق للكادر وليس مصادقة أمان مستقلة).',
                'Switching to Clinic Admin attribution requires your custom Staff Admin PIN (staff attribution only, not security authentication).',
                'گۆڕین بۆ ڕۆڵی بەڕێوەبەری کلینیک پێویستی بە کۆدی PINـی تایبەت هەیە (تەنها بۆ تۆمارکردنی ستاف، نەک پشتڕاستکردنەوەی ئاسایش).'
              )}
            </p>
            <input
              type="password"
              autoComplete="current-password"
              inputMode="numeric"
              autoFocus
              required
              aria-label={bi('رمز المدير (Admin PIN)', 'Staff Admin PIN', 'کۆدی بەڕێوەبەر')}
              value={adminPinAttempt}
              onChange={(e) => {
                setAdminPinAttempt(e.target.value);
                setAdminPinError(null);
              }}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-layer-line text-center font-mono text-base font-bold text-foreground focus:outline-none focus:border-primary"
            />
            {adminPinError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                {adminPinError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingAdminRole(null)}
                className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                disabled={adminPinSubmitting}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {adminPinSubmitting
                  ? bi('جاري التحقق...', 'Verifying...', 'پشکنین دەکرێت...')
                  : bi('تأكيد التبديل', 'Verify & Switch', 'پشتڕاستکردنەوە و گۆڕین')}
              </button>
            </div>
          </form>
      </ModalDialog>
      {/* Phase A2: 30-Second Pre-Auto-Lock Countdown Toast */}
      {secondsUntilAutoLock !== null && (
        <div
          role="status"
          aria-live="polite"
          data-testid="autolock-warning-toast"
          className="fixed bottom-4 start-4 z-[80] max-w-sm rounded-2xl bg-card border-2 border-amber-500/60 shadow-2xl p-3.5 flex items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-0.5 min-w-0">
            <div className="font-bold text-foreground">
              {bi(
                'سيتم قفل الخزينة تلقائياً بسبب الخمول',
                'Vault auto-locking due to inactivity',
                'قاسەکە خۆکارانە دادەخرێت بەهۆی ناچالاکی'
              )}
            </div>
            <div className="text-muted-foreground-1">
              {bi('المتبقي:', 'Locking in:', 'کاتی ماوە:')}{' '}
              <bdi dir="ltr" className="font-bold text-amber-800 dark:text-amber-300 tabular-nums">
                {secondsUntilAutoLock}s
              </bdi>
            </div>
          </div>
          <button
            type="button"
            onClick={stayUnlocked}
            className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
          >
            {bi('البقاء مفتوحاً', 'Stay Unlocked', 'بە کراوەیی بمێنەوە')}
          </button>
        </div>
      )}

      {/* Phase A5: Privacy Cover Overlay */}
      <PrivacyCoverOverlay
        isOpen={isPrivacyCoverOpen}
        onResume={() => setIsPrivacyCoverOpen(false)}
        onLockVault={() => {
          setIsPrivacyCoverOpen(false);
          lock();
        }}
      />

      {isRecoveryDrillOpen && (
        <Suspense fallback={null}>
          <RecoveryDrillModal
            isOpen={isRecoveryDrillOpen}
            onClose={() => setIsRecoveryDrillOpen(false)}
          />
        </Suspense>
      )}

      {isPasswordReminderOpen && (
        <Suspense fallback={null}>
          <PasswordReminderModal
            isOpen={isPasswordReminderOpen}
            onClose={() => setIsPasswordReminderOpen(false)}
            onOpenBackupModal={() => setIsBackupModalOpen(true)}
          />
        </Suspense>
      )}
    </div>
  );
};
