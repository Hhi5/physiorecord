// =======================================================================
// PhysioRecord — Screen #2: Zero-Tab Day Pulse + Split Brief / Inline Focus Queue
// - Zero-Tab Header: Greeting, Day Pulse metrics, "End of Day" closing trigger,
//   and ONE Walk-In CTA (+ secondary tools neatly tucked in Overflow Menu).
// - Desktop (>= lg): Right Clean Queue (5 cols) + Left Live Pre-Session Brief (7 cols).
// - Mobile (< lg): Inline Focus Accordion where only the focused patient expands
//   with alerts, last SOAP brief & 44px touch actions (3-4+ rows visible above fold).
// =======================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { TodaySubTab } from '../../utils/draftNavigation';
import { AppointmentScheduleView } from './AppointmentScheduleView';
import { WalkInQuickAddModal } from './WalkInQuickAddModal';
import { TodayPreSessionBrief, usePreSessionBrief } from './TodayPreSessionBrief';
import { useViewportClampedMenu } from '../../utils/menuViewportClamp';

const ReferralsAndRetentionPanel = lazy(() => import('./ReferralsAndRetentionPanel'));
const DataHealthAndTrashPanel = lazy(() => import('./DataHealthAndTrashPanel'));
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);

import { Num, Money, DemoBadge, TimeDisplay } from '../ui/Primitives';
import type { ClinicAppointment, AppointmentStatus } from '../../types/clinicManagement';
import type { PatientRecord, SessionRecord } from '../../types/clinical';
import {
  localDate,
  addDaysToDateStr,
  formatClinicalDate,
  formatDateDDMMYYYY,
  formatIraqiPhoneDisplay,
} from '../../utils/date';
import {
  buildAppointmentReminderText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import { getPatientDisplayName, isDemoPatient } from '../../utils/mrn';
import { localizeDemoText } from '../../utils/demoLocalization';
import { evaluateReEvalDueStatus } from '../../utils/reEvalNudge';
import { computeOnboardingChecklistSummary } from '../../utils/settingsOnboardingPhaseF';
import {
  UserPlus,
  CheckCircle2,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Check,
  Eye,
  EyeOff,
  FileWarning,
  MessageCircle,
  MoreHorizontal,
  Printer,
  ShieldCheck,
  Undo2,
  UserCheck,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

export type { TodaySubTab };

interface TodayCommandViewProps {
  onOpenPatientSession: (
    patient: PatientRecord,
    sessionId?: string | null,
    autoOpenFinish?: boolean
  ) => void;
  onOpenNewPatient: () => void;
  onOpenBackup: () => void;
  onOpenTour: () => void;
  onOpenSettingsTab?: (
    tab: 'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer'
  ) => void;
  onOpenBackupModal?: () => void;
  onOpenRecoveryDrill?: () => void;
  onOpenNewPatientModal?: () => void;
  requestedSubTab?: { tab: TodaySubTab; nonce: number } | null;
}

const ONBOARDING_STEP_CKB: Record<string, { title: string; desc: string; cta: string }> = {
  clinic_profile: {
    title: 'زانیاری کلینیک',
    desc: 'ناوی کلینیک، ژمارە مۆبایل، ناونیشان و لۆگۆ بنووسە بۆ ڕاپۆرت و خشتەکان.',
    cta: 'ڕێکخستنی کلینیک',
  },
  first_patient: {
    title: 'تۆمارکردنی یەکەم نەخۆش',
    desc: 'یەکەم دۆسیەی نەخۆش دروست بکە یان نەخۆشێکی کتوپڕ زیاد بکە.',
    cta: 'زیادکردنی نەخۆش',
  },
  first_backup: {
    title: 'یەکەم کۆپی یەدەگی کۆدکراو',
    desc: 'کۆپییەکی یەدەگی دابەزێنراو (.ptbackup) لە خەزێنە ناوخۆییەکەت پاشەکەوت بکە.',
    cta: 'پاشەکەوتکردن ئێستا',
  },
  verify_recovery_key: {
    title: 'پشکنینی کلیلی گەڕاندنەوە',
    desc: 'ڕاهێنانی خێرای کلیلەکە تاقی بکەرەوە بۆ دڵنیابوون لە گەڕاندنەوەی داتاکان.',
    cta: 'تاقیکردنەوەی گەڕاندنەوە',
  },
};

export const TodayCommandView: React.FC<TodayCommandViewProps> = ({
  onOpenPatientSession,
  onOpenNewPatient,
  onOpenBackup,
  onOpenTour,
  onOpenSettingsTab,
  onOpenBackupModal,
  onOpenRecoveryDrill,
  onOpenNewPatientModal,
  requestedSubTab,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const { dek, vaultGeneration, lastRecoveryDrillAt } = useVault();
  const { activePatients, patients } = usePatients();

  const [subTab, setSubTab] = useState<TodaySubTab>('today');
  useEffect(() => {
    if (requestedSubTab?.tab) {
      setSubTab(requestedSubTab.tab);
    }
  }, [requestedSubTab?.nonce, requestedSubTab?.tab]);

  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'in_session' | 'completed'>('all');
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [deferredApptIds, setDeferredApptIds] = useState<string[]>([]);
  const [isDesktopLg, setIsDesktopLg] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showOnboardingSteps, setShowOnboardingSteps] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  useViewportClampedMenu(showMoreMenu, moreMenuRef);

  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState<boolean>(() =>
    ClinicOperationsService.isOnboardingChecklistDismissed()
  );

  const [privacyBlur, setPrivacyBlur] = useState<boolean>(() =>
    ClinicOperationsService.getReceptionPrivacyBlur()
  );
  const [opsVersion, setOpsVersion] = useState(0);
  const [draftSessions, setDraftSessions] = useState<SessionRecord[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [copiedWhatsAppId, setCopiedWhatsAppId] = useState<string | null>(null);
  const [reEvalNudgesEnabled, setReEvalNudgesEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isReEvalNudgesEnabled()
  );
  const [referralsRetentionEnabled, setReferralsRetentionEnabled] = useState<boolean>(
    () =>
      ClinicOperationsService.isReferralsModuleEnabled() ||
      ClinicOperationsService.isRetentionListsEnabled()
  );
  const [dataHealthOrTrashEnabled, setDataHealthOrTrashEnabled] = useState<boolean>(
    () =>
      ClinicOperationsService.isDataHealthScreenEnabled() ||
      ClinicOperationsService.isTrashRecycleBinEnabled()
  );
  const [printTomorrowOpen, setPrintTomorrowOpen] = useState(false);
  const [schedulePrintEnabled, setSchedulePrintEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isScheduleVisitCardPrintEnabled()
  );
  const [reEvalDuePatientIds, setReEvalDuePatientIds] = useState<Set<string>>(new Set());
  const [recentCompletedUndo, setRecentCompletedUndo] = useState<{
    apptId: string;
    prevStatus: AppointmentStatus;
    patientName: string;
  } | null>(null);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktopLg(e.matches);
    setIsDesktopLg(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (moreMenuRef.current?.contains(target)) return;
      if (moreBtnRef.current?.contains(target)) return;
      setShowMoreMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMoreMenu(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMoreMenu]);

  const today = localDate();
  const tomorrow = useMemo(() => addDaysToDateStr(today, 1), [today]);

  useEffect(() => {
    const syncModule = () => {
      setReEvalNudgesEnabled(ClinicOperationsService.isReEvalNudgesEnabled());
      const refRetOn =
        ClinicOperationsService.isReferralsModuleEnabled() ||
        ClinicOperationsService.isRetentionListsEnabled();
      setReferralsRetentionEnabled(refRetOn);
      if (!refRetOn) {
        setSubTab((curr) => (curr === 'referrals_retention' ? 'today' : curr));
      }
      const dataHealthOn =
        ClinicOperationsService.isDataHealthScreenEnabled() ||
        ClinicOperationsService.isTrashRecycleBinEnabled();
      setDataHealthOrTrashEnabled(dataHealthOn);
      if (!dataHealthOn) {
        setSubTab((curr) => (curr === 'data_health' ? 'today' : curr));
      }
      setSchedulePrintEnabled(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
    };
    const unsub = ClinicOperationsService.subscribe(() => {
      setOpsVersion((v) => v + 1);
      setPrivacyBlur(ClinicOperationsService.getReceptionPrivacyBlur());
      setChecklistDismissed(ClinicOperationsService.isOnboardingChecklistDismissed());
      syncModule();
    });
    window.addEventListener('physiorecord-modules-updated', syncModule);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', syncModule);
    };
  }, []);

  const onboardingSummary = useMemo(() => {
    void opsVersion;
    return computeOnboardingChecklistSummary({
      clinicProfile: ClinicOperationsService.getClinicProfile(),
      patientCount: activePatients.length,
      backupMeta: ClinicOperationsService.getBackupMeta(),
      lastRecoveryDrillAt,
      isDismissed: checklistDismissed,
    });
  }, [opsVersion, activePatients.length, lastRecoveryDrillAt, checklistDismissed]);

  const todayAppointments = useMemo(() => {
    void opsVersion;
    const list = ClinicOperationsService.ensureRecurringAppointmentsForDate(today);
    return [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [today, opsVersion]);

  const tomorrowAppointments = useMemo(() => {
    void opsVersion;
    const list = ClinicOperationsService.ensureRecurringAppointmentsForDate(tomorrow);
    return list
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [tomorrow, opsVersion]);

  useEffect(() => {
    if (!reEvalNudgesEnabled || !dek || todayAppointments.length === 0) {
      setReEvalDuePatientIds(new Set());
      return;
    }
    let active = true;
    const cfg = ClinicOperationsService.getReEvalNudgeConfig();
    const patientIds = Array.from(
      new Set(todayAppointments.filter((a) => a.status !== 'cancelled').map((a) => a.patientId))
    );
    void (async () => {
      const due = new Set<string>();
      for (const pid of patientIds) {
        const eps = await EpisodeService.getEpisodesByPatient(pid, dek).catch(() => []);
        const activeEp =
          eps.find((e) => e.data.status !== 'completed' && e.data.status !== 'archived') || eps[0];
        if (!activeEp) continue;
        await ClinicOperationsService.ensurePatientColdStoresLoadedAsync(pid, [activeEp.id]);
        const store = ClinicOperationsService.getEpisodeClinicalStore(activeEp.id, pid);
        const sessions = await SessionService.getSessionsByEpisode(activeEp.id, dek).catch(() => []);
        const validSessions = sessions.filter((s) => s.data.status !== 'cancelled');
        const snaps = store.snapshots || [];
        const latestSnap = snaps.length > 0 ? snaps[snaps.length - 1] : undefined;
        const lastEvalDateStr = (
          latestSnap?.recordedDate ||
          activeEp.data.startDate ||
          activeEp.createdAt ||
          ''
        ).slice(0, 10);
        const sessionsSinceLastEval = latestSnap
          ? validSessions.filter((s) => {
              const sessDay = (s.data.sessionDate || s.createdAt).slice(0, 10);
              const snapDay = latestSnap.recordedDate.slice(0, 10);
              return sessDay > snapDay || (sessDay === snapDay && s.createdAt > latestSnap.recordedDate);
            }).length
          : validSessions.length;
        const res = evaluateReEvalDueStatus({
          enabled: true,
          sessionsSinceLastEval,
          lastEvalDateStr,
          todayDateStr: today,
          thresholdSessions: cfg.afterSessions,
          thresholdDays: cfg.afterDays,
        });
        if (res.isDue) due.add(pid);
      }
      if (active) setReEvalDuePatientIds(due);
    })();
    return () => {
      active = false;
    };
  }, [reEvalNudgesEnabled, dek, todayAppointments, today, opsVersion]);

  const loadDraftSessions = useCallback(async () => {
    if (!dek) return;
    setLoadingDrafts(true);
    try {
      const drafts = await SessionService.getAllDraftSessions(dek);
      setDraftSessions(drafts);
    } catch {
      setDraftSessions([]);
    } finally {
      setLoadingDrafts(false);
    }
  }, [dek]);

  useEffect(() => {
    void loadDraftSessions();
  }, [loadDraftSessions, subTab, opsVersion]);

  const smartMemory = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getSmartMemory();
  }, [opsVersion]);

  const queueCounts = useMemo(() => {
    const active = todayAppointments.filter((a) => a.status !== 'cancelled');
    return {
      total: active.length,
      waiting: active.filter((a) => a.status === 'scheduled' || a.status === 'arrived').length,
      inSession: active.filter((a) => a.status === 'in_session').length,
      completed: active.filter((a) => a.status === 'completed').length,
    };
  }, [todayAppointments]);

  const filteredAppointments = useMemo(() => {
    const active = todayAppointments.filter((a) => a.status !== 'cancelled');
    if (statusFilter === 'waiting') {
      return active.filter((a) => a.status === 'scheduled' || a.status === 'arrived');
    }
    if (statusFilter === 'in_session') {
      return active.filter((a) => a.status === 'in_session');
    }
    if (statusFilter === 'completed') {
      return active.filter((a) => a.status === 'completed');
    }
    return active;
  }, [todayAppointments, statusFilter]);

  const prioritizedActiveQueue = useMemo(() => {
    const active = todayAppointments.filter(
      (a) => a.status !== 'cancelled' && a.status !== 'completed'
    );
    const tierWeight: Record<AppointmentStatus, number> = {
      in_session: 0,
      arrived: 1,
      scheduled: 2,
      completed: 3,
      cancelled: 4,
      no_show: 5,
    };
    return [...active].sort((a, b) => {
      const aDef = deferredApptIds.includes(a.id) ? 1 : 0;
      const bDef = deferredApptIds.includes(b.id) ? 1 : 0;
      if (aDef !== bDef) return aDef - bDef;
      const wDiff = tierWeight[a.status] - tierWeight[b.status];
      return wDiff !== 0 ? wDiff : a.startTime.localeCompare(b.startTime);
    });
  }, [todayAppointments, deferredApptIds]);

  const effectiveSelectedAppt = useMemo(() => {
    if (filteredAppointments.length === 0) return null;
    if (selectedApptId) {
      const match = filteredAppointments.find((a) => a.id === selectedApptId);
      if (match) return match;
    }
    const nextInFilter = prioritizedActiveQueue.find((q) =>
      filteredAppointments.some((f) => f.id === q.id)
    );
    return nextInFilter || filteredAppointments[0];
  }, [filteredAppointments, selectedApptId, prioritizedActiveQueue]);

  const selectedApptPatient = useMemo(
    () =>
      effectiveSelectedAppt
        ? patients.find((p) => p.id === effectiveSelectedAppt.patientId)
        : undefined,
    [effectiveSelectedAppt, patients]
  );

  const brief = usePreSessionBrief(effectiveSelectedAppt, selectedApptPatient, opsVersion);

  const todayFinanceSummary = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getFinanceSummaryForDate(today);
  }, [today, opsVersion]);

  const clinicProfile = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getClinicProfile();
  }, [opsVersion]);

  const handleCompleteAndAdvance = (appt: ClinicAppointment) => {
    ClinicOperationsService.updateAppointmentStatus(appt.id, 'completed');
    setDeferredApptIds((prev) => prev.filter((id) => id !== appt.id));
    const nextCandidate = prioritizedActiveQueue.find((a) => a.id !== appt.id);
    setSelectedApptId(nextCandidate ? nextCandidate.id : null);

    setRecentCompletedUndo({
      apptId: appt.id,
      prevStatus: appt.status,
      patientName: appt.patientName,
    });
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    undoToastTimerRef.current = setTimeout(() => {
      setRecentCompletedUndo(null);
    }, 6000);
  };

  const handleSkipToNext = (appt: ClinicAppointment) => {
    if (prioritizedActiveQueue.length <= 1) return;
    const nextDeferred = [...deferredApptIds.filter((id) => id !== appt.id), appt.id];
    setDeferredApptIds(nextDeferred);
    const nextCandidate = prioritizedActiveQueue.find((a) => a.id !== appt.id);
    if (nextCandidate) setSelectedApptId(nextCandidate.id);
  };

  const handleUndoFinish = () => {
    if (!recentCompletedUndo) return;
    ClinicOperationsService.updateAppointmentStatus(
      recentCompletedUndo.apptId,
      recentCompletedUndo.prevStatus
    );
    setSelectedApptId(recentCompletedUndo.apptId);
    setRecentCompletedUndo(null);
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
  };

  const ensureAndStartSessionForPatient = async (
    patient: PatientRecord,
    appt?: ClinicAppointment,
    autoOpenFinish = false
  ) => {
    if (!dek) return;
    setActionError(null);
    setStartingId(appt?.id || patient.id);
    try {
      const episodes = await EpisodeService.getEpisodesByPatient(patient.id, dek);
      let activeEpisode =
        (appt?.episodeId ? episodes.find((ep) => ep.id === appt.episodeId) : undefined) ||
        episodes.find((ep) => ep.status === 'active');

      if (!activeEpisode) {
        activeEpisode = await EpisodeService.createEpisode(
          patient.id,
          {
            title:
              appt?.episodeTitle ||
              appt?.notes ||
              bi(
                'حلقة تأهيل وعلاج طبيعي',
                'Physiotherapy Rehab Episode',
                'قۆناغی شیاندنەوە و چارەسەری سروشتی'
              ),
            medicalDiagnosis:
              appt?.episodeTitle ||
              bi(
                'قيد التقييم والتأهيل',
                'Ongoing PT Assessment',
                'لە ژێر هەڵسەنگاندن و شیاندنەوەدایە'
              ),
            clinicalImpression: bi(
              'بدأت من شاشة اليوم — يُستكمل التقييم والانطباع في الجلسة',
              'Started from Today view — documented in session',
              'لە شاشەی ئەمڕۆ دەستی پێکرا — هەڵسەنگاندن لە ناو دانیشتنەکە تەواو دەکرێت'
            ),
            primarySpecialty: 'general',
            affectedBodyRegion: appt?.notes || bi('عام', 'General', 'گشتی'),
            rehabilitationGoals: { shortTerm: [], longTerm: [] },
            startDate: today,
            status: 'active',
          },
          dek
        );
      }

      const sessions = await SessionService.getSessionsByEpisode(activeEpisode.id, dek);
      const staff = ClinicOperationsService.getActiveStaff();
      let targetSession =
        sessions.find((s) => s.status === 'draft' && s.sessionDate === today) ||
        sessions.find((s) => s.status === 'draft');

      if (!targetSession) {
        targetSession = await SessionService.createSession(
          patient.id,
          activeEpisode.id,
          {
            sessionDate: today,
            sessionTime:
              appt?.startTime ||
              `${String(new Date().getHours()).padStart(2, '0')}:${String(
                new Date().getMinutes()
              ).padStart(2, '0')}`,
            sessionDurationMinutes: appt?.durationMinutes || smartMemory.lastDurationMinutes || 45,
            sessionType: sessions.length === 0 ? 'initial_evaluation' : 'follow_up',
            attendanceStatus: 'attended',
            therapistName: bi(staff.nameAr, staff.nameEn, staff.nameAr),
          },
          dek,
          undefined,
          undefined,
          vaultGeneration ?? undefined
        );
      }

      if (appt && appt.status !== 'completed' && !autoOpenFinish) {
        ClinicOperationsService.updateAppointmentStatus(appt.id, 'in_session');
      }
      ClinicOperationsService.recordPatientVisitMemory(patient.id);
      onOpenPatientSession(patient, targetSession.id, autoOpenFinish);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر فتح أو إنشاء الجلسة العلاجية.',
              'Failed to open or create clinical session.',
              'کردنەوە یان دروستکردنی دانیشتنی چارەسەر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setStartingId(null);
    }
  };

  const handleRowStatus = (apptId: string, nextStatus: AppointmentStatus) => {
    ClinicOperationsService.updateAppointmentStatus(apptId, nextStatus);
  };

  const togglePrivacyBlur = () => {
    ClinicOperationsService.setReceptionPrivacyBlur(!privacyBlur);
  };

  const renderStatusPill = (status: AppointmentStatus) => {
    const styles: Record<AppointmentStatus, { ar: string; en: string; ckb: string; cls: string }> = {
      scheduled: {
        ar: 'محجوز',
        en: 'Scheduled',
        ckb: 'نۆرەگیراو',
        cls: 'text-sky-700 dark:text-sky-300',
      },
      arrived: {
        ar: 'وصل',
        en: 'Arrived',
        ckb: 'گەیشت',
        cls: 'text-amber-700 dark:text-amber-300',
      },
      in_session: {
        ar: 'بالجلسة',
        en: 'In Session',
        ckb: 'لە دانیشتندایە',
        cls: 'text-primary',
      },
      completed: {
        ar: 'منتهي',
        en: 'Completed',
        ckb: 'تەواوبوو',
        cls: 'text-emerald-700 dark:text-emerald-300',
      },
      cancelled: {
        ar: 'ملغي',
        en: 'Cancelled',
        ckb: 'هەڵوەشاوەتەوە',
        cls: 'text-muted-foreground-2',
      },
      no_show: {
        ar: 'لم يحضر',
        en: 'No Show',
        ckb: 'نەهات',
        cls: 'text-rose-700 dark:text-rose-300',
      },
    };
    const info = styles[status] || styles.scheduled;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-extrabold ${info.cls}`}>
        <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
        <span>{bi(info.ar, info.en, info.ckb)}</span>
      </span>
    );
  };

  const clinicGreeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return bi('صباح الخير', 'Good morning', 'بەیانیت باش');
    if (hr < 17) return bi('طاب يومك', 'Good afternoon', 'ڕۆژت باش');
    return bi('مساء الخير', 'Good evening', 'ئێوارەت باش');
  }, [bi]);

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const remainingCount = queueCounts.waiting + queueCounts.inSession;

  return (
    <div className="max-w-[85rem] w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-4 pb-8">
      {/* ================================================================ */}
      {/* ZERO-TAB DAY PULSE STRIP (Calm Header + Live Metrics + 1 Walk-In) */}
      {/* ================================================================ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Title & Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          {subTab !== 'today' && (
            <button
              type="button"
              data-testid="today-back-to-queue-btn"
              onClick={() => setSubTab('today')}
              aria-label={bi('العودة لليوم', 'Back to Today', 'گەڕانەوە بۆ ئەمڕۆ')}
              className="size-11 sm:size-9 rounded-xl bg-card shadow-2xs hover:bg-surface text-foreground inline-flex items-center justify-center shrink-0 cursor-pointer"
            >
              <BackIcon className="size-4" />
            </button>
          )}
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground-1">
              <span className="text-primary font-bold">{clinicGreeting}</span>
              <span aria-hidden="true">·</span>
              <span>{formatClinicalDate(today, language)}</span>
            </div>
            <h1 className="pr-page-title leading-tight">
              {subTab === 'eod'
                ? bi('إغلاق نهاية اليوم', 'End of Day Closing', 'داخستنی کۆتایی ڕۆژ')
                : subTab === 'schedule'
                  ? bi('الجدول الأسبوعي الكامل', 'Weekly Schedule', 'خشتەی هەفتانە')
                  : subTab === 'referrals_retention'
                    ? bi('الإحالات والمتابعة', 'Referrals & Retention', 'ئاڕاستە و بەدواداچوون')
                    : subTab === 'data_health'
                      ? bi('صحة البيانات والسلة', 'Data Health & Recycle Bin', 'تەندروستی داتا')
                      : bi('اليوم والطابور', 'Today & Queue', 'ئەمڕۆ و ڕیز')}
            </h1>
          </div>
        </div>

        {/* Consolidated Serene Day Pulse Strip + 1 Concise Walk-In + Quiet Actions */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {subTab === 'today' && (
            <div className="pr-surface rounded-full px-3.5 py-1 inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs min-h-[44px] sm:min-h-[38px]">
              {/* Remaining Patients Filter Trigger */}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'waiting' ? 'all' : 'waiting')}
                className={`min-h-[36px] sm:min-h-[28px] inline-flex items-center gap-1.5 font-bold cursor-pointer transition-colors ${
                  statusFilter === 'waiting'
                    ? 'text-primary font-extrabold'
                    : 'text-foreground hover:text-primary'
                }`}
              >
                <Clock className="size-3.5 text-primary shrink-0" />
                <span>{bi('المتبقون:', 'Left:', 'ماوە:')}</span>
                <span className="font-extrabold tabular-nums">
                  <Num value={remainingCount} />
                </span>
              </button>

              {draftSessions.length > 0 && (
                <>
                  <span className="h-3.5 w-px bg-black/[0.08] dark:bg-white/[0.1]" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setSubTab('eod')}
                    className="min-h-[36px] sm:min-h-[28px] text-amber-700 dark:text-amber-300 hover:opacity-80 font-extrabold inline-flex items-center gap-1 cursor-pointer transition-opacity"
                  >
                    <FileWarning className="size-3.5 shrink-0" />
                    <span>
                      <Num value={draftSessions.length} />{' '}
                      {bi('مسودة', draftSessions.length === 1 ? 'draft' : 'drafts', 'مسۆدە')}
                    </span>
                  </button>
                </>
              )}

              <span className="h-3.5 w-px bg-black/[0.08] dark:bg-white/[0.1]" aria-hidden="true" />

              {/* Today Net Cash + Close Day */}
              <button
                type="button"
                data-testid="today-subtab-eod"
                onClick={() => setSubTab('eod')}
                className="min-h-[36px] sm:min-h-[28px] inline-flex items-center gap-1.5 font-bold text-foreground hover:text-primary cursor-pointer transition-colors"
              >
                <Banknote className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <Money amount={todayFinanceSummary.netCashIQD} className="font-extrabold" />
                <span className="text-muted-foreground-2" aria-hidden="true">·</span>
                <span className="text-primary font-extrabold">
                  {bi('إغلاق اليوم', 'Close Day', 'داخستن')}
                </span>
              </button>
            </div>
          )}

          {/* Single Concise Walk-In Trigger */}
          <button
            type="button"
            data-testid="today-walkin-btn"
            onClick={() => setShowWalkInModal(true)}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-1.5 rounded-full bg-primary/12 hover:bg-primary/20 text-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <UserPlus className="size-4 shrink-0" />
            <span>{bi('+ مراجع سريع', '+ Walk-In', '+ سەردانیکەری خێرا')}</span>
          </button>

          {/* Privacy Blur Toggle */}
          <button
            type="button"
            onClick={togglePrivacyBlur}
            className="size-11 sm:size-9 rounded-full bg-card/90 hover:bg-card text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center shadow-2xs cursor-pointer transition-colors shrink-0"
            aria-label={bi('إخفاء أو إظهار أسماء المرضى', 'Privacy blur patient names', 'شاردنەوەی ناوی نەخۆش')}
            title={bi('تمويه أسماء المرضى', 'Privacy blur patient names', 'لێڵکردنی ناوی نەخۆشان')}
          >
            {privacyBlur ? <EyeOff className="size-4 text-primary" /> : <Eye className="size-4" />}
          </button>

          {/* Overflow Menu for Rare/Secondary Utilities */}
          <div className="relative shrink-0">
            <button
              ref={moreBtnRef}
              type="button"
              data-testid="today-more-menu-btn"
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              onClick={() => setShowMoreMenu((prev) => !prev)}
              aria-label={bi('خيارات إضافية', 'More options', 'هەڵبژاردنی زیاتر')}
              className="size-11 sm:size-9 rounded-full bg-card/90 hover:bg-card text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center shadow-2xs cursor-pointer transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </button>

            {showMoreMenu && (
              <div
                ref={moreMenuRef}
                role="menu"
                className="absolute top-full mt-2 end-0 w-60 max-w-[calc(100vw-1rem)] z-40 rounded-2xl bg-card border border-line-2 shadow-2xl p-1.5 space-y-0.5 text-xs"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (onOpenNewPatientModal) onOpenNewPatientModal();
                    else onOpenNewPatient();
                  }}
                  className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <UserPlus className="size-4 text-primary shrink-0" />
                  <span>{bi('تسجيل مريض (ملف كامل)', 'New Patient (Full Form)', 'نەخۆشی نوێ')}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="today-subtab-schedule"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setSubTab('schedule');
                  }}
                  className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Calendar className="size-4 text-primary shrink-0" />
                  <span>{bi('الجدول الكامل والحجز المتكرر', 'Full Weekly Schedule', 'خشتەی هەفتانە')}</span>
                </button>

                {schedulePrintEnabled && tomorrowAppointments.length > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setPrintTomorrowOpen(true);
                    }}
                    className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Printer className="size-4 text-primary shrink-0" />
                    <span>{bi('طباعة قائمة الغد', "Print Tomorrow's List", 'چاپکردنی سبەینێ')}</span>
                  </button>
                )}

                {referralsRetentionEnabled && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="today-subtab-referrals_retention"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setSubTab('referrals_retention');
                    }}
                    className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="size-4 text-primary shrink-0" />
                    <span>{bi('الإحالات والمتابعة', 'Referrals & Retention', 'ئاڕاستەکردن')}</span>
                  </button>
                )}

                {dataHealthOrTrashEnabled && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="today-subtab-data_health"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setSubTab('data_health');
                    }}
                    className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="size-4 text-primary shrink-0" />
                    <span>{bi('صحة البيانات والسلة', 'Data Health & Trash', 'تەندروستی داتا')}</span>
                  </button>
                )}

                {!onboardingSummary.allCompleted && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowOnboardingSteps((prev) => !prev);
                    }}
                    className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-primary shrink-0" />
                      <span>{bi('إعداد العيادة', 'Clinic Setup', 'ڕێکخستنی کلینیک')}</span>
                    </span>
                    <span dir="ltr" className="font-mono text-primary font-bold">
                      {onboardingSummary.completedCount}/{onboardingSummary.totalCount}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenTour();
                  }}
                  className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Compass className="size-4 shrink-0" />
                  <span>{bi('جولة استخدام سريعة', 'Quick Tour', 'گەشتی خێرا')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <p className="px-1 text-xs font-bold text-rose-700 dark:text-rose-300">
          {actionError}
        </p>
      )}

      {/* Optional Expandable Onboarding Checklist (Hidden from default daily flow unless opened) */}
      {showOnboardingSteps && !onboardingSummary.allCompleted && (
        <div
          data-testid="onboarding-checklist-card"
          className="p-4 rounded-[22px] bg-card border border-line-2/70 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary shrink-0" />
              <h2 className="text-xs sm:text-sm font-extrabold text-foreground">
                {bi('إعداد العيادة السريع', 'Clinic Quick Setup', 'ڕێکخستنی خێرای کلینیک')}
              </h2>
              <span
                data-testid="onboarding-checklist-progress"
                dir="ltr"
                className="text-xs font-mono font-extrabold text-primary tabular-nums"
              >
                {onboardingSummary.completedCount}/{onboardingSummary.totalCount}
              </span>
            </div>
            <button
              type="button"
              data-testid="onboarding-checklist-dismiss-btn"
              onClick={() => {
                setShowOnboardingSteps(false);
                setChecklistDismissed(true);
                void ClinicOperationsService.setOnboardingChecklistDismissedAsync(true);
              }}
              className="min-h-[40px] sm:min-h-[32px] px-3 py-1 rounded-full bg-surface hover:bg-layer-hover text-xs font-bold text-muted-foreground-1 cursor-pointer"
            >
              {bi('إغلاق', 'Close', 'داخستن')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {onboardingSummary.steps.map((step) => {
              const stepCkb = ONBOARDING_STEP_CKB[step.id];
              return (
                <div
                  key={step.id}
                  data-testid={`onboarding-step-${step.id}`}
                  className={`p-3 rounded-2xl flex flex-col justify-between gap-2 ${
                    step.completed ? 'bg-primary/[0.06]' : 'bg-surface/80'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      {step.completed ? (
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <span className="size-4 rounded-full border-2 border-muted-foreground-2 inline-block shrink-0" />
                      )}
                      <span className="text-xs font-extrabold text-foreground">
                        {bi(step.titleAr, step.titleEn, stepCkb?.title)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground-1 leading-relaxed">
                      {bi(step.descAr, step.descEn, stepCkb?.desc)}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`onboarding-action-${step.id}`}
                    onClick={() => {
                      if (step.id === 'clinic_profile') {
                        onOpenSettingsTab?.('clinic');
                      } else if (step.id === 'first_patient') {
                        if (onOpenNewPatientModal) onOpenNewPatientModal();
                        else setShowWalkInModal(true);
                      } else if (step.id === 'first_backup') {
                        if (onOpenBackupModal) onOpenBackupModal();
                        else onOpenBackup();
                      } else if (step.id === 'verify_recovery_key') {
                        onOpenRecoveryDrill?.();
                      }
                    }}
                    className={`min-h-[40px] sm:min-h-[34px] w-full px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                      step.completed
                        ? 'bg-card text-foreground border border-line-2/60'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {step.completed && <Check className="size-3.5 text-emerald-600" />}
                    <span>{bi(step.ctaAr, step.ctaEn, stepCkb?.cta)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW 1: SPLIT PRE-SESSION BRIEF (DESKTOP) + INLINE FOCUS (MOBILE)*/}
      {/* ================================================================ */}
      {subTab === 'today' && (
        <div className="space-y-3.5">
          {/* Minimalist Underline Status Filter Tabs */}
          <div
            role="tablist"
            aria-label={bi('تصفية مواعيد اليوم', "Filter today's appointments")}
            className="flex items-center gap-4 sm:gap-5 border-b border-black/[0.06] dark:border-white/[0.08] overflow-x-auto pr-hide-scrollbar px-1"
          >
            {(
              [
                { id: 'all', ar: 'الكل', en: 'All', ckb: 'هەموو', count: queueCounts.total },
                { id: 'waiting', ar: 'بالانتظار', en: 'Waiting', ckb: 'چاوەڕوان', count: queueCounts.waiting },
                { id: 'in_session', ar: 'بالجلسة', en: 'In Session', ckb: 'لە دانیشتندا', count: queueCounts.inSession },
                { id: 'completed', ar: 'مكتمل', en: 'Completed', ckb: 'تەواوبوو', count: queueCounts.completed },
              ] as const
            ).map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(f.id)}
                  data-active={active}
                  className={`min-h-[44px] sm:min-h-[38px] inline-flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer border-b-2 -mb-px pb-2.5 pt-1.5 transition-colors ${
                    active
                      ? 'text-primary font-extrabold border-primary'
                      : 'text-muted-foreground-1 hover:text-foreground font-semibold border-transparent'
                  }`}
                >
                  <span>{bi(f.ar, f.en, f.ckb)}</span>
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      active ? 'text-primary' : 'text-muted-foreground-2'
                    }`}
                  >
                    (<Num value={f.count} />)
                  </span>
                </button>
              );
            })}
          </div>

          {/* Undo Bar after Marking Appointment Complete */}
          {recentCompletedUndo && (
            <div
              role="status"
              className="px-4 py-2 rounded-2xl bg-card border border-primary/25 shadow-sm flex items-center justify-between gap-3 text-xs"
            >
              <span className="text-foreground font-semibold truncate">
                {bi(
                  `تم إنهاء موعد ${recentCompletedUndo.patientName}`,
                  `Completed ${recentCompletedUndo.patientName}`,
                  `نۆرەی ${recentCompletedUndo.patientName} تەواوکرا`
                )}
              </span>
              <button
                type="button"
                data-testid="today-undo-btn"
                onClick={handleUndoFinish}
                className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Undo2 className="size-3.5" />
                <span>{bi('تراجع', 'Undo', 'گەڕانەوە')}</span>
              </button>
            </div>
          )}

          {/* Main Asymmetric Grid: Queue (5 cols RTL-Right) + Pre-Session Brief (7 cols RTL-Left) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Queue List Column */}
            <div className="lg:col-span-5 space-y-3 min-w-0">
              {filteredAppointments.length === 0 ? (
                <div
                  data-testid="today-empty-state"
                  className="pr-surface rounded-[22px] p-6 text-center space-y-3"
                >
                  <Clock className="size-7 text-primary/45 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">
                      {bi(
                        'لا توجد مواعيد في هذا التصنيف',
                        'No appointments in this filter',
                        'هیچ نۆرەیەک لەم پۆلەدا نییە'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'اضغط «+ مراجع سريع» لتسجيل مراجع خلال 10 ثوانٍ.',
                        'Tap "+ Walk-In" to register a patient in 10 seconds.',
                        'کرتە لە «+ سەردانیکەری خێرا» بکە.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="today-empty-primary-btn"
                    onClick={() => setShowWalkInModal(true)}
                    className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="size-4" />
                    <span>{bi('تسجيل مراجع سريع', 'New Walk-In', 'تۆمارکردنی خێرا')}</span>
                  </button>
                </div>
              ) : (
                <div className="pr-surface rounded-[22px] divide-y divide-black/[0.045] dark:divide-white/[0.06] overflow-hidden">
                  {filteredAppointments.map((appt) => {
                    const matchedPatient = patients.find((p) => p.id === appt.patientId);
                    const isFocused = effectiveSelectedAppt?.id === appt.id;
                    const isBusy = startingId === appt.id;
                    const isDemo =
                      appt.isDemo || (matchedPatient ? isDemoPatient(matchedPatient) : false);
                    const isReEvalDue =
                      reEvalNudgesEnabled && reEvalDuePatientIds.has(appt.patientId);

                    return (
                      <div
                        key={appt.id}
                        data-testid={`today-row-${appt.id}`}
                        data-selected={isFocused ? 'true' : 'false'}
                        className={`transition-colors group ${
                          isFocused
                            ? 'bg-primary/[0.09] dark:bg-primary/[0.15] border-s-[3px] border-s-primary'
                            : 'hover:bg-primary/[0.02]'
                        }`}
                      >
                        {/* Row Summary Header (Tap/Click to focus on Desktop OR expand inline on Mobile) */}
                        <div className="flex items-center justify-between gap-2 pe-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedApptId(appt.id)}
                            aria-expanded={!isDesktopLg ? isFocused : undefined}
                            className="flex items-center gap-3 min-w-0 flex-1 text-start bg-transparent border-0 p-3.5 cursor-pointer min-h-[44px]"
                          >
                            {/* Time Block */}
                            <div
                              className={`px-2.5 py-1.5 rounded-xl text-center shrink-0 min-w-[70px] ${
                                isFocused
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-primary/[0.08] text-primary'
                              }`}
                            >
                              <TimeDisplay
                                time={appt.startTime}
                                className={`text-xs font-extrabold justify-center ${
                                  isFocused ? 'text-primary-foreground' : 'text-primary'
                                }`}
                              />
                              <span
                                className={`text-xs block font-semibold ${
                                  isFocused
                                    ? 'text-primary-foreground/85'
                                    : 'text-muted-foreground-1'
                                }`}
                              >
                                <Num value={appt.durationMinutes} /> {bi('د', 'm', 'خ')}
                              </span>
                            </div>

                            {/* Patient Name + Status + Subtle Badges */}
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span
                                  className={`text-sm font-extrabold text-foreground truncate ${
                                    privacyBlur ? 'blur-xs select-none' : ''
                                  }`}
                                >
                                  {localizeDemoText(appt.patientName, language)}
                                </span>
                                {isDemo && <DemoBadge />}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
                                {renderStatusPill(appt.status)}
                                {isReEvalDue && (
                                  <span
                                    data-testid="today-reeval-due-badge"
                                    className="font-bold text-amber-700 dark:text-amber-300"
                                  >
                                    · {bi('إعادة تقييم', 'Re-eval', 'دووبارە هەڵسەنگاندن')}
                                  </span>
                                )}
                                {appt.roomOrBed && (
                                  <span className="hidden sm:inline truncate">
                                    · {localizeDemoText(appt.roomOrBed, language)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Right/End Indicator: Hover-reveal Arrived on Desktop, Chevron on Mobile */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isDesktopLg && appt.status === 'scheduled' && !isFocused && (
                              <button
                                type="button"
                                onClick={() => handleRowStatus(appt.id, 'arrived')}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 min-h-[32px] px-2.5 py-1 rounded-lg bg-surface hover:bg-layer-hover text-amber-800 dark:text-amber-300 text-xs font-extrabold cursor-pointer transition-opacity"
                              >
                                {bi('وصل', 'Arrived', 'گەیشت')}
                              </button>
                            )}
                            {!isDesktopLg && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedApptId((curr) =>
                                    curr === appt.id ? null : appt.id
                                  )
                                }
                                aria-label={
                                  isFocused
                                    ? bi('طي التفاصيل', 'Collapse details')
                                    : bi('توسيع التفاصيل', 'Expand details')
                                }
                                className="size-11 rounded-xl text-muted-foreground-1 hover:bg-surface inline-flex items-center justify-center cursor-pointer"
                              >
                                {isFocused ? (
                                  <ChevronUp className="size-4 text-primary" />
                                ) : (
                                  <ChevronDown className="size-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Mobile Inline Focus Expansion (ONLY renders for focused row below lg) */}
                        {!isDesktopLg && isFocused && (
                          <TodayPreSessionBrief
                            variant="inline-mobile"
                            appt={appt}
                            patient={matchedPatient}
                            brief={brief}
                            privacyBlur={privacyBlur}
                            isBusy={isBusy}
                            reEvalDue={isReEvalDue}
                            canSkipToNext={prioritizedActiveQueue.length > 1}
                            statusPill={renderStatusPill(appt.status)}
                            onStartSession={() =>
                              matchedPatient &&
                              void ensureAndStartSessionForPatient(matchedPatient, appt, false)
                            }
                            onFinishAndCollect={() =>
                              matchedPatient &&
                              void ensureAndStartSessionForPatient(matchedPatient, appt, true)
                            }
                            onCompleteAdvance={() => handleCompleteAndAdvance(appt)}
                            onMarkArrived={() => handleRowStatus(appt.id, 'arrived')}
                            onSkipToNext={() => handleSkipToNext(appt)}
                            onOpenChart={() =>
                              matchedPatient && onOpenPatientSession(matchedPatient)
                            }
                            onOpenWalkIn={() => setShowWalkInModal(true)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop Split Pre-Session Brief Column (Sticky on lg+) */}
            {isDesktopLg && (
              <div className="lg:col-span-7 lg:sticky lg:top-4 min-w-0">
                <TodayPreSessionBrief
                  variant="desktop"
                  appt={effectiveSelectedAppt}
                  patient={selectedApptPatient}
                  brief={brief}
                  privacyBlur={privacyBlur}
                  isBusy={Boolean(
                    effectiveSelectedAppt && startingId === effectiveSelectedAppt.id
                  )}
                  reEvalDue={Boolean(
                    effectiveSelectedAppt &&
                      reEvalNudgesEnabled &&
                      reEvalDuePatientIds.has(effectiveSelectedAppt.patientId)
                  )}
                  canSkipToNext={prioritizedActiveQueue.length > 1}
                  statusPill={
                    effectiveSelectedAppt ? renderStatusPill(effectiveSelectedAppt.status) : null
                  }
                  onStartSession={() =>
                    effectiveSelectedAppt &&
                    selectedApptPatient &&
                    void ensureAndStartSessionForPatient(
                      selectedApptPatient,
                      effectiveSelectedAppt,
                      false
                    )
                  }
                  onFinishAndCollect={() =>
                    effectiveSelectedAppt &&
                    selectedApptPatient &&
                    void ensureAndStartSessionForPatient(
                      selectedApptPatient,
                      effectiveSelectedAppt,
                      true
                    )
                  }
                  onCompleteAdvance={() =>
                    effectiveSelectedAppt && handleCompleteAndAdvance(effectiveSelectedAppt)
                  }
                  onMarkArrived={() =>
                    effectiveSelectedAppt &&
                    handleRowStatus(effectiveSelectedAppt.id, 'arrived')
                  }
                  onSkipToNext={() =>
                    effectiveSelectedAppt && handleSkipToNext(effectiveSelectedAppt)
                  }
                  onOpenChart={() =>
                    selectedApptPatient && onOpenPatientSession(selectedApptPatient)
                  }
                  onOpenWalkIn={() => setShowWalkInModal(true)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW 2: END OF DAY CLOSING PANEL                                 */}
      {/* ================================================================ */}
      {subTab === 'eod' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 p-4 pr-surface space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-card-divider/60 pb-2.5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                  <Banknote className="size-4 text-emerald-700 dark:text-emerald-400" />
                  <span>
                    {bi(
                      'ملخص الصندوق والتحصيل اليومي',
                      'Today Cash & Payment Summary',
                      'پوختەی سندووق و پارەدانی ئەمڕۆ'
                    )}
                  </span>
                </h2>
                <span className="text-xs font-semibold text-muted-foreground-1">
                  <Num value={todayFinanceSummary.paymentCount} /> {bi('عملية قبض', 'receipts', 'وەسڵ')}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-0.5">
                <div className="px-1 py-1.5">
                  <span className="text-muted-foreground-1 block mb-1">{bi('نقداً', 'Cash', 'کاش')}</span>
                  <Money amount={todayFinanceSummary.byMethod.cash} className="text-sm font-extrabold" />
                </div>
                <div className="px-1 py-1.5">
                  <span className="text-muted-foreground-1 block mb-1">ZainCash</span>
                  <Money amount={todayFinanceSummary.byMethod.zain_cash} className="text-sm font-extrabold" />
                </div>
                <div className="px-1 py-1.5">
                  <span className="text-muted-foreground-1 block mb-1">QiCard</span>
                  <Money amount={todayFinanceSummary.byMethod.qi_card} className="text-sm font-extrabold" />
                </div>
                <div className="px-1 py-1.5">
                  <span className="text-muted-foreground-1 block mb-1">{bi('أخرى', 'Other', 'هیتر')}</span>
                  <Money amount={todayFinanceSummary.byMethod.other} className="text-sm font-extrabold" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-card-divider/50 text-xs">
                <div className="px-1 py-1.5 flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {bi('إجمالي المقبوضات:', 'Total Collected:', 'کۆی وەرگیراو:')}
                  </span>
                  <Money amount={todayFinanceSummary.totalCollectedIQD} className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300" />
                </div>
                <div className="px-1 py-1.5 flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {bi('مصاريف اليوم:', 'Today Expenses:', 'خەرجییەکانی ئەمڕۆ:')}
                  </span>
                  <Money amount={todayFinanceSummary.expensesIQD} className="text-sm font-extrabold text-orange-600 dark:text-orange-400" />
                </div>
                <div className="px-1 py-1.5 flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {bi('صافي الصندوق:', 'Net Cash:', 'پوختەی سندووق:')}
                  </span>
                  <Money amount={todayFinanceSummary.netCashIQD} className="text-sm font-extrabold text-primary" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 p-4 pr-surface flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{bi('حماية بيانات نهاية اليوم', 'Daily Encrypted Backup', 'پاراستنی داتای کۆتایی ڕۆژ')}</span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'احفظ نسخة مشفرة مضغوطة (v3.0) لبيانات مرضاك ومدفوعات اليوم على جهازك في ثوانٍ.',
                    'Save a compressed chunked AES-GCM backup (.ptbackup) of today’s clinical & billing records in seconds.',
                    'لە چەند چرکەیەکدا کۆپییەکی یەدەگی کۆدکراو (.ptbackup) پاشەکەوت بکە.'
                  )}
                </p>
              </div>
              <button
                type="button"
                data-testid="eod-backup-now-btn"
                onClick={onOpenBackup}
                className="min-h-[46px] w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <ShieldCheck className="size-4" />
                <span>{bi('نسخ احتياطي الآن (10 ثوانٍ)', 'Backup now (10 s)', 'پاشەکەوتکردن ئێستا')}</span>
              </button>
            </div>
          </div>

          <div className="p-4 pr-surface space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-card-divider/60 pb-2.5">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                <FileWarning className="size-4 text-amber-700 dark:text-amber-400" />
                <span>
                  {bi(
                    'ملاحظات الجلسات غير الموقعة (المسودات)',
                    'Unsigned / Draft Session Notes',
                    'تێبینییە واژوونەکراوەکانی دانیشتنەکان (مسۆدەکان)'
                  )}
                </span>
              </h2>
              <span className="text-xs font-bold text-muted-foreground-1">
                {loadingDrafts
                  ? bi('جاري الفحص...', 'Scanning...', 'پشکنین دەکرێت...')
                  : <Num value={draftSessions.length} />}
              </span>
            </div>

            {draftSessions.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold py-2">
                {bi(
                  'ممتاز! جميع جلساتك معتمدة ومقفلة بالختم ولا توجد مسودات معلّقة.',
                  'All clear! Every session note is finalized and sealed.',
                  'نایابە! هەموو دانیشتنەکانت پەسەندکراون.'
                )}
              </p>
            ) : (
              <div className="divide-y divide-card-divider/60">
                {draftSessions.map((draft) => {
                  const p = patients.find((pt) => pt.id === draft.patientId);
                  const name = p ? getPatientDisplayName(p.data, language) : draft.patientId;
                  return (
                    <div
                      key={draft.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className={`font-bold text-foreground leading-snug ${privacyBlur ? 'blur-xs' : ''}`}>
                          {name}
                        </p>
                        <p className="text-muted-foreground-1 mt-0.5">
                          {bi('جلسة #', 'Session #', 'دانیشتن #')}
                          <Num value={draft.sessionNumber} /> ·{' '}
                          <bdi dir="ltr" className="font-mono">{formatDateDDMMYYYY(draft.sessionDate)}</bdi>
                        </p>
                      </div>
                      {p && (
                        <button
                          type="button"
                          onClick={() => onOpenPatientSession(p, draft.id, false)}
                          className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg hover:bg-surface/80 text-amber-700 dark:text-amber-300 font-bold cursor-pointer shrink-0 transition-colors"
                        >
                          {bi('إكمال واعتماد', 'Review & Sign', 'تەواوکردن و پەسەندکردن')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 pr-surface space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider/60 pb-2.5">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                <MessageCircle className="size-4 text-emerald-700 dark:text-emerald-400" />
                <span>
                  {bi(
                    `مواعيد الغد وتذكيرات واتساب (${formatClinicalDate(tomorrow, language)})`,
                    `Tomorrow’s Schedule & WhatsApp Reminders (${formatClinicalDate(tomorrow, language)})`,
                    `خشتەی سبەینێ و یادخەرەوەکانی واتساپ (${formatClinicalDate(tomorrow, language)})`
                  )}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground-1">
                  <Num value={tomorrowAppointments.length} /> {bi('موعد', 'visits', 'سەردان')}
                </span>
                {schedulePrintEnabled && (
                  <button
                    type="button"
                    data-testid="eod-print-tomorrow-schedule-btn"
                    onClick={() => setPrintTomorrowOpen(true)}
                    className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg bg-surface/65 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="size-3.5 text-primary" />
                    <span>{bi('طباعة جدول الغد', "Print Tomorrow's Schedule", 'چاپکردنی خشتەی سبەینێ')}</span>
                  </button>
                )}
              </div>
            </div>

            {tomorrowAppointments.length === 0 ? (
              <p className="text-xs text-muted-foreground-1 py-2">
                {bi(
                  'لا توجد مواعيد مسجلة ليوم غد بعد.',
                  'No appointments scheduled for tomorrow yet.',
                  'هێشتا هیچ نۆرەیەک بۆ سبەینێ تۆمار نەکراوە.'
                )}
              </p>
            ) : (
              <div className="divide-y divide-card-divider/60">
                {tomorrowAppointments.map((appt) => {
                  const langKey = language === 'en' ? 'en' : 'ar';
                  const templates = ClinicOperationsService.getWhatsAppTemplates();
                  const msg = buildAppointmentReminderText({
                    template: templates.appointmentReminder[langKey],
                    appointment: appt,
                    clinicProfile,
                    lang: langKey,
                  });
                  const waUrl = buildUserInitiatedWhatsAppHref(appt.patientPhone, msg);
                  const copied = copiedWhatsAppId === appt.id;

                  return (
                    <div
                      key={appt.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TimeDisplay time={appt.startTime} className="font-extrabold text-primary" />
                          <span className={`font-bold text-foreground ${privacyBlur ? 'blur-xs' : ''}`}>
                            {appt.patientName}
                          </span>
                          {appt.patientPhone && (
                            <bdi dir="ltr" className="font-mono text-muted-foreground-1">
                              {formatIraqiPhoneDisplay(appt.patientPhone)}
                            </bdi>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(msg).then(() => {
                              setCopiedWhatsAppId(appt.id);
                              setTimeout(() => setCopiedWhatsAppId(null), 2000);
                            });
                          }}
                          className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg bg-surface/65 hover:bg-surface text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                          <span>
                            {copied
                              ? bi('نُسخ', 'Copied', 'لەبەرگیرا')
                              : bi('نسخ التذكير', 'Copy', 'لەبەرگرتنەوە')}
                          </span>
                        </button>

                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold inline-flex items-center gap-1.5"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>{bi('تذكير واتساب', 'WhatsApp', 'واتساپ')}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground-2 px-2">
                            {bi('لا يوجد رقم هاتف', 'No phone', 'ژمارە تەلەفۆن نییە')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SECONDARY VIEWS (Accessible via Overflow Menu / Draft Recovery)  */}
      {/* ================================================================ */}
      {subTab === 'schedule' && (
        <AppointmentScheduleView onNewPatient={onOpenNewPatient} privacyBlur={privacyBlur} />
      )}

      {subTab === 'referrals_retention' && referralsRetentionEnabled && (
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi('جاري تحميل الإحالات وقوائم المتابعة...', 'Loading Referrals & Retention...')}
            </div>
          }
        >
          <ReferralsAndRetentionPanel
            onOpenPatientChart={(patient) => onOpenPatientSession(patient, null, false)}
          />
        </Suspense>
      )}

      {subTab === 'data_health' && dataHealthOrTrashEnabled && (
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi('جاري تحميل فحص صحة البيانات والسلة...', 'Loading Data Health & Recycle Bin...')}
            </div>
          }
        >
          <DataHealthAndTrashPanel
            patients={patients}
            draftSessions={draftSessions}
            onOpenPatientSession={onOpenPatientSession}
            onOpenBilling={() => setSubTab('eod')}
            onOpenBackup={onOpenBackup}
          />
        </Suspense>
      )}

      <WalkInQuickAddModal
        isOpen={showWalkInModal}
        onOpenChange={setShowWalkInModal}
        onCompleted={({ patient, sessionId }) => {
          onOpenPatientSession(patient, sessionId, false);
        }}
      />

      {printTomorrowOpen && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={printTomorrowOpen}
            onClose={() => setPrintTomorrowOpen(false)}
            documentType="tomorrow_schedule"
            scheduleDate={tomorrow}
            scheduleAppointments={tomorrowAppointments}
          />
        </Suspense>
      )}
    </div>
  );
};
