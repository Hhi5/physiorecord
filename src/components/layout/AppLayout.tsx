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
  getPatientDisplayName,
} from '../../utils/mrn';
import { DemoBadge } from '../ui/Primitives';
import { ModalDialog } from '../ui/Dialog';
import { PatientSearchEngine } from '../../utils/arabicSearch';
import { isPublicDemoUrlOrEnv } from '../../utils/settingsOnboardingPhaseF';
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
const FirstRunModeWizardModal = lazy(() =>
  import('../FirstRunModeWizardModal').then((m) => ({ default: m.FirstRunModeWizardModal }))
);
const PatientMergeModal = lazy(() => import('../clinic/PatientMergeModal'));
import { db } from '../../db/db';
import { SYNTHETIC_PATIENTS } from '../../data/syntheticPatients';
import { usePatients } from '../../context/PatientContext';
import { useVault } from '../../context/VaultContext';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatIraqiPhoneDisplay } from '../../utils/date';
import type { PatientRecord } from '../../types/clinical';
import type {
  ClinicRoleId,
  ClinicStaffMember,
  FinishUndoSnapshot,
} from '../../types/clinicManagement';
import {
  Accessibility,
  Activity,
  Calendar,
  Dumbbell,
  Footprints,
  HandHeart,
  HeartPulse,
  Stethoscope,
  Wallet,
  UserPlus,
  AlertTriangle,
  X,
  Database,
  KeyRound,
  Trash2,
  RefreshCw,
  Smartphone,
  RotateCcw,
  BarChart3,
  TabletSmartphone,
  PlayCircle,
  Command,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { patients, savePatient, deleteAllDemoPatients, refreshPatients } = usePatients();
  const {
    lock,
    secondsUntilAutoLock,
    stayUnlocked,
    recoveredDrafts,
    dismissRecoveredDraft,
    clearAllRecoveredDrafts,
    isRecoveryDrillDue,
    snoozeRecoveryDrillBanner,
    lastRepairSummary,
    repairError,
    lastMigrationResult,
    dismissRepairNotice,
  } = useVault();
  const { language, isRtl, bi } = useLanguage();

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
    'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer'
  >('currency');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
  const pwa = usePwaStatus();

  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isRecoveryDrillOpen, setIsRecoveryDrillOpen] = useState(false);
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
    window.addEventListener('physiorecord-staff-updated', syncOperationsState);
    window.addEventListener('physiorecord-modules-updated', syncOperationsState);
    window.addEventListener('physiorecord-backup-updated', syncOperationsState);
    window.addEventListener('physiorecord-demo-data-changed', syncOperationsState);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-staff-updated', syncOperationsState);
      window.removeEventListener('physiorecord-modules-updated', syncOperationsState);
      window.removeEventListener('physiorecord-backup-updated', syncOperationsState);
      window.removeEventListener('physiorecord-demo-data-changed', syncOperationsState);
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
        if (isSidebarOpen && !hasOpenDialog && !isGlobalSearchOpen && !isPrivacyCoverOpen) {
          e.preventDefault();
          setIsSidebarOpen(false);
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
  }, [isSidebarOpen, isGlobalSearchOpen, isPrivacyCoverOpen, lock]);

  // Android Hardware Back Button / Gesture Handler (Closes open modals/menus or steps back in navigation)
  useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (isPrivacyCoverOpen) {
        e.preventDefault();
        setIsPrivacyCoverOpen(false);
        return;
      }
      if (isSidebarOpen) {
        e.preventDefault();
        setIsSidebarOpen(false);
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
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
    isSidebarOpen,
    isGlobalSearchOpen,
    isSettingsModalOpen,
    isBackupModalOpen,
    isSeedModalOpen,
    isPatientModalOpen,
    isTourOpen,
    isRecoveryDrillOpen,
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

  const commandPaletteActions = React.useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    const baseActions = [
      {
        id: 'new_patient',
        labelAr: 'تسجيل مريض جديد',
        labelEn: 'New Patient',
        labelCkb: 'تۆمارکردنی نەخۆشی نوێ',
        keywords: 'new patient مريض جديد اضافة نەخۆش',
        icon: UserPlus,
        run: () => handleOpenNewPatient(),
      },
      {
        id: 'start_session',
        labelAr: 'بدء الجلسة التالية / شاشة اليوم',
        labelEn: 'Start Next Session / Today',
        labelCkb: 'دەستپێکردنی دانیشتنی داهاتوو / ئەمڕۆ',
        keywords: 'start session soap جلسة اليوم دانیشتن',
        icon: PlayCircle,
        run: () => {
          setSelectedPatientId(null);
          setActiveNav(isSoloMode ? 'today' : 'reception');
        },
      },
      {
        id: 'record_payment',
        labelAr: 'تسجيل دفعة أو فاتورة مالية',
        labelEn: 'Record Payment / Finance',
        labelCkb: 'تۆمارکردنی پارەدان یان پسوولە',
        keywords: 'record payment invoice finance دفع فاتورة مالية قبض پارەدان',
        icon: Wallet,
        run: () => {
          setSelectedPatientId(null);
          setActiveNav('finance');
        },
      },
      {
        id: 'book_appointment',
        labelAr: 'حجز موعد جديد',
        labelEn: 'Book Appointment',
        labelCkb: 'تۆمارکردنی نۆرەی نوێ',
        keywords: 'book appointment schedule موعد حجز جدول نۆرە',
        icon: Calendar,
        run: () => {
          setSelectedPatientId(null);
          setActiveNav(isSoloMode ? 'today' : 'schedule');
        },
      },
      {
        id: 'backup_now',
        labelAr: 'نسخ احتياطي مشفر الآن',
        labelEn: 'Backup Now',
        labelCkb: 'پاشەکەوتی کۆدکراو ئێستا',
        keywords: 'backup now restore نسخ احتياطي پاشەکەوت',
        icon: Database,
        run: () => setIsBackupModalOpen(true),
      },
      ...(showAnalyticsModule
        ? [
            {
              id: 'open_analytics',
              labelAr: 'فتح لوحة التحليلات المحلية',
              labelEn: 'Open Local Analytics',
              labelCkb: 'کردنەوەی پانێڵی شیکاریی ناوخۆیی',
              keywords: 'analytics reports stats احصائيات تحليلات شیکاری',
              icon: BarChart3,
              run: () => {
                setSelectedPatientId(null);
                setActiveNav('analytics');
              },
            },
          ]
        : []),
      ...(enableKioskModule
        ? [
            {
              id: 'launch_kiosk',
              labelAr: 'تشغيل وضع كشك المريض (مقفل)',
              labelEn: 'Launch Patient Kiosk Mode',
              labelCkb: 'کارپێکردنی دۆخی کیۆسکی نەخۆش (داخراو)',
              keywords: 'kiosk check in tablet كشك مريض تسجيل ذاتي کیۆسک',
              icon: TabletSmartphone,
              run: () => setIsKioskModalOpen(true),
            },
          ]
        : []),
    ];

    if (!q) return baseActions;
    return baseActions.filter(
      (a) =>
        a.labelAr.toLowerCase().includes(q) ||
        a.labelEn.toLowerCase().includes(q) ||
        a.labelCkb.toLowerCase().includes(q) ||
        a.keywords.includes(q)
    );
  }, [globalSearchQuery, isSoloMode, showAnalyticsModule, enableKioskModule]);

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

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-background-1 text-foreground"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Layer 1: Underneath Sidebar Panel (Revealed when main workspace slides sideways) */}
      <div className={isPrivacyCoverOpen ? 'filter blur-md pointer-events-none select-none' : ''}>
        <Sidebar
          isOpen={isSidebarOpen}
          onCloseDrawer={() => setIsSidebarOpen(false)}
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
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenBackup={() => setIsBackupModalOpen(true)}
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
          hasDemoRecords={hasDemoRecords}
        />
      </div>

      {/* Layer 2: Floating Main Canvas (Slides horizontally to uncover underneath Sidebar) */}
      <main
        data-sidebar-open={isSidebarOpen ? 'true' : 'false'}
        className={`pr-main-stage pr-main-canvas flex flex-col min-w-0 overflow-hidden ${
          isPrivacyCoverOpen ? 'filter blur-md pointer-events-none select-none' : ''
        }`}
      >
        {/* Subtle Physiotherapy Motif Layer + Insulating Frosted Blur Veil over Theme Gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-x-0 top-0 h-[28rem] z-0 overflow-hidden"
        >
          <div className="relative w-full h-full text-primary opacity-[0.20] dark:opacity-[0.16] blur-[0.85px]">
            <Accessibility
              strokeWidth={1.65}
              className="absolute top-6 end-6 sm:end-16 size-24 sm:size-28 -rotate-12"
            />
            <HeartPulse
              strokeWidth={1.65}
              className="absolute top-12 start-[14%] size-16 sm:size-20 -rotate-6"
            />
            <Activity
              strokeWidth={1.65}
              className="hidden sm:block absolute top-10 start-[44%] size-20 rotate-6"
            />
            <Dumbbell
              strokeWidth={1.65}
              className="absolute top-36 start-6 sm:start-16 size-20 sm:size-24 rotate-12"
            />
            <Stethoscope
              strokeWidth={1.65}
              className="absolute top-44 end-6 sm:end-24 size-20 sm:size-24 -rotate-[18deg]"
            />
            <Footprints
              strokeWidth={1.65}
              className="hidden sm:block absolute top-64 start-[28%] size-16 rotate-[22deg] opacity-80"
            />
            <HandHeart
              strokeWidth={1.65}
              className="hidden sm:block absolute top-56 end-[28%] size-16 -rotate-12 opacity-80"
            />
          </div>
          <div className="pr-backdrop-veil absolute inset-0" />
        </div>
        {/* Semicircular 3-Line Handle attached at top-start seam */}
        <button
          type="button"
          data-testid="sidebar-handle-btn"
          data-open={isSidebarOpen ? 'true' : 'false'}
          aria-expanded={isSidebarOpen}
          aria-label={
            isSidebarOpen
              ? bi('إغلاق القائمة الجانبية', 'Close sidebar', 'داخستنی لیستی لاوەکی')
              : bi('فتح القائمة الجانبية', 'Open sidebar', 'کردنەوەی لیستی لاوەکی')
          }
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className={`pr-drawer-ear focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            selectedPatient ? 'hidden' : ''
          }`}
        >
          <span className="pr-drawer-ear-line w-4" aria-hidden="true" />
          <span className="pr-drawer-ear-line w-3" aria-hidden="true" />
          <span className="pr-drawer-ear-line w-4" aria-hidden="true" />
        </button>

        {/* Unobtrusive click-anywhere overlay on the shifted main canvas to close drawer */}
        {isSidebarOpen && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={bi('إغلاق القائمة الجانبية', 'Close sidebar', 'داخستنی لیستی لاوەکی')}
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 z-40 bg-slate-950/[0.03] cursor-pointer focus:outline-none"
          />
        )}

        {/* Phase F4: Compact Public Demo Mode Banner */}
        {isPublicDemoActive && (
          <div
            data-testid="public-demo-mode-banner"
            className="ps-11 sm:ps-12 pe-3 sm:pe-5 py-1.5 bg-amber-800 text-white border-b border-amber-900 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-30"
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
            className="relative z-10 ps-11 sm:ps-12 pe-3 sm:pe-4 py-1 bg-primary/10 border-b border-primary/25 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0"
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

        {pwa.updateReady && (
          <div className="relative z-10 ps-11 sm:ps-12 pe-4 py-1.5 bg-primary/15 border-b border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground shrink-0">
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

        {/* iOS Safari Add-to-Home-Screen Installation Guidance (1.8) */}
        {pwa.isIosSafariInstallEligible && !iosInstallDismissed && (
          <div className="relative z-10 ps-11 sm:ps-12 pe-4 py-1.5 bg-surface border-b border-card-divider flex items-center justify-between gap-2 text-xs text-foreground shrink-0">
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

        {/* Compact Combined Environment Status Strip: Backup Reminder + Active Demo Indicator (V-06 / V-08) */}
        {(isBackupOverdue || hasDemoRecords) && !selectedPatient && (
          <div
            data-testid="environment-status-strip"
            className="relative z-10 ps-14 sm:ps-16 pe-3 sm:pe-5 pt-2.5 pb-1 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300 shrink-0 min-h-[42px]"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {hasDemoRecords && <DemoBadge />}
              <span className="font-bold truncate">
                {isBackupOverdue ? (
                  !lastBackupIso ? (
                    <>
                      {bi(
                        'لم تُصدّر نسخة ',
                        'No ',
                        'هێشتا کۆپی '
                      )}
                      <bdi dir="ltr">.ptbackup</bdi>
                      {bi(' بعد', ' backup yet', ' دەرنەکراوە')}
                    </>
                  ) : (
                    bi(
                      `النسخة الاحتياطية قديمة (${formattedLastBackup})`,
                      `Backup overdue (${formattedLastBackup})`,
                      `کۆپی یەدەگ کۆنە (${formattedLastBackup})`
                    )
                  )
                ) : (
                  bi('بيانات تجريبية نشطة', 'Demo data active', 'داتای تاقیکاری چالاکە')
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBackupOverdue && (
                <button
                  type="button"
                  onClick={() => setIsBackupModalOpen(true)}
                  className="min-h-[34px] px-2.5 py-1 rounded-full bg-card/65 hover:bg-card text-amber-800 dark:text-amber-300 text-xs font-extrabold cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                >
                  {bi('نسخ احتياطي', 'Backup Now', 'پاشەکەوت ئێستا')}
                </button>
              )}
              {hasDemoRecords && (
                <button
                  type="button"
                  data-testid="manage-demo-data-strip-btn"
                  onClick={() => setIsSeedModalOpen(true)}
                  className="min-h-[34px] px-2.5 py-1 rounded-full bg-card/65 hover:bg-card text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                >
                  <Database className="size-3.5" />
                  <span>{bi('إدارة العرض', 'Manage Demo', 'بەڕێوەبردنی تاقیکاری')}</span>
                </button>
              )}
              {isBackupOverdue && (
                <button
                  type="button"
                  onClick={() => setBackupBannerDismissed(true)}
                  className="size-8 rounded-full hover:bg-card/60 inline-flex items-center justify-center cursor-pointer shrink-0 text-amber-800 dark:text-amber-300"
                  aria-label={bi('إخفاء التنبيه', 'Dismiss backup reminder', 'شاردنەوەی ئاگاداری پاشەکەوت')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Phase 1.3: Dismissible Legacy Migration Warning -> Review & Resolve Modal */}
        {!migrationBannerDismissed && unmigratedCount > 0 && (
          <div className="relative z-10 ps-11 sm:ps-12 pe-3 sm:pe-4 py-1.5 text-xs text-amber-800 dark:text-amber-300 shrink-0">
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
            className={`relative z-10 ps-11 sm:ps-12 pe-4 py-1.5 flex items-center justify-between gap-2.5 text-xs shrink-0 ${
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
                onFinishCompleted={(snap, summaryAr, summaryEn) =>
                  triggerFinishUndoToast(snap, bi(summaryAr, summaryEn))
                }
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
              <AppointmentScheduleView onNewPatient={handleOpenNewPatient} />
            )}

            {activeNav === 'finance' && <IraqiFinancialLedgerView />}

            {showExerciseLibrary && activeNav === 'exercises' && <ExerciseLibraryHepView />}

            {showAnalyticsModule && activeNav === 'analytics' && <LocalAnalyticsView />}

            {activeNav === 'activity_log' && (
              <ActivityLogView onRoleChanged={(staff) => setActiveRole(staff.role)} />
            )}
            </Suspense>

            <footer className="py-5 px-6 text-center text-xs text-muted-foreground-2/85 mt-6">
              {bi(
                'بياناتك مشفرة ومحفوظة على هذا الجهاز فقط',
                'Your data is encrypted and stored on this device only'
              )}
            </footer>
            </div>
          </div>
        )}
      </main>

      {/* Global Command Palette & Arabic-Aware Patient Search (Ctrl/Cmd+K) */}
      <ModalDialog
        isOpen={isGlobalSearchOpen}
        onOpenChange={(open) => {
          if (!open) setIsGlobalSearchOpen(false);
        }}
        size="sm"
        hideCloseButton
        ariaLabel={bi(
          'لوحة الأوامر والبحث السريع',
          'Command Palette & Patient Search',
          'پانێڵی فەرمانەکان و گەڕانی خێرا'
        )}
        closeLabel={bi('إغلاق البحث', 'Close search', 'داخستنی گەڕان')}
        dir={isRtl ? 'rtl' : 'ltr'}
        overlayClassName="items-start justify-center pt-14 sm:pt-20 px-4"
        className="bg-card border-card-line max-w-lg"
        bodyClassName="flex flex-col overflow-hidden"
      >
            <div className="p-3.5 border-b border-card-divider flex items-center gap-2.5">
              <Command className="w-4 h-4 text-primary shrink-0" />
              <input
                ref={globalSearchInputRef}
                autoFocus
                type="text"
                aria-label={bi('بحث شامل أو أمر سريع', 'Quick command or patient search', 'فەرمانی خێرا یان گەڕان')}
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setCommandHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  const visiblePatients = globalFilteredPatients.slice(0, 10);
                  const totalItems = commandPaletteActions.length + visiblePatients.length;
                  if (totalItems === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCommandHighlightIdx((idx) => (idx + 1) % totalItems);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCommandHighlightIdx((idx) => (idx - 1 + totalItems) % totalItems);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const clampedIdx = Math.min(commandHighlightIdx, totalItems - 1);
                    if (clampedIdx < commandPaletteActions.length) {
                      setIsGlobalSearchOpen(false);
                      commandPaletteActions[clampedIdx].run();
                    } else {
                      const p = visiblePatients[clampedIdx - commandPaletteActions.length];
                      if (p) {
                        setIsGlobalSearchOpen(false);
                        setSelectedPatientId(p.id);
                      }
                    }
                  }
                }}
                placeholder={bi(
                  'اكتب أمراً أو ابحث عن مريض (الاسم، ٠٧٧٠، آخر 4 أرقام، MRN)...',
                  'Type an action or search patient (name, phone suffix, MRN)...',
                  'فەرمانێک بنووسە یان بۆ نەخۆش بگەڕێ (ناو، ٠٧٧٠، ٤ ژمارەی کۆتایی، MRN)...'
                )}
                className="flex-1 bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground-1 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setIsGlobalSearchOpen(false)}
                aria-label={bi('إغلاق البحث', 'Close search', 'داخستنی گەڕان')}
                className="size-9 rounded-lg text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              tabIndex={0}
              aria-label={bi('نتائج البحث السريع', 'Quick search results', 'ئەنجامەکانی گەڕان')}
              className="max-h-96 overflow-y-auto divide-y divide-card-divider focus:outline-none"
            >
              {commandPaletteActions.length > 0 && (
                <div className="p-2 space-y-1 bg-surface/50">
                  <div className="px-2 py-1 text-xs font-bold text-muted-foreground-1">
                    {bi('إجراءات سريعة', 'Quick Actions', 'کردارە خێراکان')}
                  </div>
                  {commandPaletteActions.map((act, actionIdx) => {
                    const ActIcon = act.icon;
                    const highlighted = commandHighlightIdx === actionIdx;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => {
                          setIsGlobalSearchOpen(false);
                          act.run();
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-start flex items-center justify-between gap-2 text-xs font-bold transition-colors cursor-pointer ${
                          highlighted
                            ? 'bg-primary/15 text-primary'
                            : 'text-foreground hover:bg-layer-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <ActIcon className="w-4 h-4 text-primary shrink-0" />
                          <span>{bi(act.labelAr, act.labelEn, act.labelCkb)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground-1">↵</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {globalFilteredPatients.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'لا يوجد مريض مطابق للبحث.',
                      'No matching patients found.',
                      'هیچ نەخۆشێک نەدۆزرایەوە کە لەگەڵ گەڕانەکە بگونجێت.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsGlobalSearchOpen(false);
                      handleOpenNewPatient();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{bi('+ تسجيل مريض جديد', '+ Add New Patient', '+ تۆمارکردنی نەخۆشی نوێ')}</span>
                  </button>
                </div>
              ) : (
                globalFilteredPatients.slice(0, 10).map((p, idx) => {
                  const mrn = getPatientMrn(p, idx);
                  const name = getPatientDisplayName(p.data, language);
                  const itemIdx = commandPaletteActions.length + idx;
                  const highlighted = commandHighlightIdx === itemIdx;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setIsGlobalSearchOpen(false);
                        setSelectedPatientId(p.id);
                      }}
                      className={`w-full px-4 py-3 text-start flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        highlighted ? 'bg-primary/10' : 'hover:bg-layer-hover'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {name}
                        </p>
                        <p className="text-xs text-muted-foreground-1 tabular-nums">
                          <bdi dir="ltr" className="font-mono">
                            {mrn}
                          </bdi>
                          {(p.data.phoneNumber || p.data.phone) && (
                            <>
                              {' · '}
                              <bdi dir="ltr">
                                {formatIraqiPhoneDisplay(p.data.phoneNumber || p.data.phone)}
                              </bdi>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-primary shrink-0">
                        {bi('فتح الملف', 'Open', 'کردنەوە')}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
      </ModalDialog>

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
              setIsTourOpen(true);
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

      {/* Optional Solo Guided Tour Modal (Phase 2.8) */}
      {isTourOpen && (
        <Suspense fallback={null}>
          <GuidedTourModal
            isOpen={isTourOpen}
            onOpenChange={setIsTourOpen}
            hasDemoData={hasDemoRecords}
            onLoadDemoData={handleLoadTourDemoData}
            onDeleteAllDemoData={handleDeleteTourDemoData}
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
    </div>
  );
};
