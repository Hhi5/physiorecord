// =======================================================================
// PhysioRecord — Today Command Center & End-of-Day Screen (Phase 2.1, 2.2, 2.5, 2.6, 2.7, 2.8)
// Merged Reception + Schedule + Walk-in Quick-Add + End-of-Day Closing +
// Pinned/Recent Smart Memory + Thumb-Reach Mobile Action Bar
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

const ReferralsAndRetentionPanel = lazy(() => import('./ReferralsAndRetentionPanel'));
const DataHealthAndTrashPanel = lazy(() => import('./DataHealthAndTrashPanel'));
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
import { ContextualTipBanner } from './ContextualTipsAndTour';
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
import { getPatientDisplayName, getPatientMrn, isDemoPatient } from '../../utils/mrn';
import { evaluateReEvalDueStatus } from '../../utils/reEvalNudge';
import { computeOnboardingChecklistSummary } from '../../utils/settingsOnboardingPhaseF';
import {
  Play,
  UserPlus,
  CheckCircle2,
  Banknote,
  Calendar,
  Clock,
  FileWarning,
  ShieldCheck,
  MessageCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Star,
  History,
  UserCheck,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowLeft,
  ArrowRight,
  SkipForward,
  Undo2,
  CalendarClock,
  Sparkles,
  Printer,
  Stethoscope,
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
  const [showWalkInModal, setShowWalkInModal] = useState(false);
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
  const [tossExitingId, setTossExitingId] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [deferredApptIds, setDeferredApptIds] = useState<string[]>([]);
  const [recentCompletedUndo, setRecentCompletedUndo] = useState<{
    apptId: string;
    prevStatus: AppointmentStatus;
    patientName: string;
  } | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const isDraggingCardRef = useRef(false);
  const tossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tossTimerRef.current) clearTimeout(tossTimerRef.current);
      if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    };
  }, []);

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

  // Ensure recurring weekly appointments expand for today & tomorrow whenever data changes
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
      .sort((a, b) => a.startTime.localeCompare(a.startTime));
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
        const lastEvalDateStr = (latestSnap?.recordedDate || activeEp.data.startDate || activeEp.createdAt || '').slice(0, 10);
        const sessionsSinceLastEval = latestSnap
          ? validSessions.filter((s) => (s.data.sessionDate || s.createdAt.slice(0, 10)) > latestSnap.recordedDate.slice(0, 10)).length
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

  // Load encrypted unsigned/draft notes for End-of-Day tab (and Today count badge)
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

  const pinnedPatients = useMemo(
    () =>
      smartMemory.pinnedPatientIds
        .map((id) => activePatients.find((p) => p.id === id))
        .filter((p): p is PatientRecord => Boolean(p)),
    [smartMemory.pinnedPatientIds, activePatients]
  );

  const recentPatients = useMemo(
    () =>
      smartMemory.recentPatientIds
        .filter((id) => !smartMemory.pinnedPatientIds.includes(id))
        .map((id) => activePatients.find((p) => p.id === id))
        .filter((p): p is PatientRecord => Boolean(p))
        .slice(0, 6),
    [smartMemory.recentPatientIds, smartMemory.pinnedPatientIds, activePatients]
  );

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

  // Prioritized queue for the interactive stacked card deck:
  // in_session -> arrived -> scheduled (with user-deferred cards shifted after the front)
  const queuedAppointments = useMemo(() => {
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
      const aDeferred = deferredApptIds.includes(a.id) ? 1 : 0;
      const bDeferred = deferredApptIds.includes(b.id) ? 1 : 0;
      if (aDeferred !== bDeferred) return aDeferred - bDeferred;
      const wDiff = tierWeight[a.status] - tierWeight[b.status];
      if (wDiff !== 0) return wDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [todayAppointments, deferredApptIds]);

  const handleTossFinishCard = (appt: ClinicAppointment) => {
    if (tossExitingId) return;
    setTossExitingId(appt.id);
    if (tossTimerRef.current) clearTimeout(tossTimerRef.current);
    tossTimerRef.current = setTimeout(() => {
      ClinicOperationsService.updateAppointmentStatus(appt.id, 'completed');
      setTossExitingId(null);
      setDeferredApptIds((prev) => prev.filter((id) => id !== appt.id));
      setRecentCompletedUndo({
        apptId: appt.id,
        prevStatus: appt.status,
        patientName: appt.patientName,
      });
      if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = setTimeout(() => {
        setRecentCompletedUndo(null);
      }, 6000);
    }, 330);
  };

  const handleDeferFrontCard = (apptId: string) => {
    if (queuedAppointments.length <= 1 || tossExitingId) return;
    setTossExitingId(apptId);
    if (tossTimerRef.current) clearTimeout(tossTimerRef.current);
    tossTimerRef.current = setTimeout(() => {
      setDeferredApptIds((prev) => [...prev.filter((id) => id !== apptId), apptId]);
      setTossExitingId(null);
    }, 300);
  };

  const handleUndoTossFinish = () => {
    if (!recentCompletedUndo) return;
    ClinicOperationsService.updateAppointmentStatus(
      recentCompletedUndo.apptId,
      recentCompletedUndo.prevStatus
    );
    setRecentCompletedUndo(null);
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
  };

  const todayFinanceSummary = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getFinanceSummaryForDate(today);
  }, [today, opsVersion]);

  const clinicProfile = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getClinicProfile();
  }, [opsVersion]);

  const ensureAndStartSessionForPatient = async (
    patient: PatientRecord,
    appt?: ClinicAppointment,
    autoOpenFinish = false
  ) => {
    if (!dek) return;
    setActionError(null);
    setStartingId(appt?.id || patient.id);
    try {
      // 1. Find active episode (or reuse appt.episodeId), otherwise create quick episode
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

      // 2. Find an existing draft session for today (or latest draft), otherwise create a new session
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
            sessionTime: appt?.startTime || `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
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
        ar: 'وصل / بالانتظار',
        en: 'Arrived',
        ckb: 'گەیشت / چاوەڕوانە',
        cls: 'text-amber-700 dark:text-amber-300',
      },
      in_session: {
        ar: 'داخل الجلسة',
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
      <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${info.cls}`}>
        <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
        <span>{bi(info.ar, info.en, info.ckb)}</span>
      </span>
    );
  };

  const ArrowOpenIcon = isRtl ? ArrowUpLeft : ArrowUpRight;
  const SideTossIcon = isRtl ? ArrowLeft : ArrowRight;

  const clinicGreeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return bi('صباح الخير', 'Good morning', 'بەیانیت باش');
    if (hr < 17) return bi('طاب يومك', 'Good afternoon', 'ڕۆژت باش');
    return bi('مساء الخير', 'Good evening', 'ئێوارەت باش');
  }, [bi]);

  return (
    <div className="max-w-[85rem] w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 pb-8">
      {/* Contextual Onboarding Tip (2.8) */}
      <div className="max-[1479px]:ps-12 sm:max-[1479px]:ps-14">
        <ContextualTipBanner
          tipId="today_welcome_tip"
          titleAr="إدارة يوم العيادة بخطوة واحدة"
          titleEn="Streamlined Daily Solo Workflow"
          titleCkb="بەڕێوەبردنی ڕۆژی کلینیک بە یەک هەنگاو"
          bodyAr='سجّل المراجع المفاجئ بالاسم والهاتف فقط خلال 10 ثوانٍ، أو اضغط "نهاية اليوم" لمراجعة النقد، المسودات غير الموقعة، وتذكيرات الواتساب.'
          bodyEn='Add walk-in patients in 10 seconds with just name & phone, or open "End of Day" for daily cash summary, unsigned drafts, and WhatsApp reminders.'
          bodyCkb='لە ماوەی ١٠ چرکەدا نەخۆشی کتوپڕ تۆمار بکە تەنها بە ناو و ژمارە تەلەفۆن، یان "کۆتایی ڕۆژ" بکەرەوە بۆ پوختەی سندووق، مسۆدە واژوونەکراوەکان و یادخەرەوەی واتساپ.'
          onStartTour={onOpenTour}
        />
      </div>

      {/* Airy Top Header Band (Borderless directly over soft theme gradient canvas) */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3.5 max-[1479px]:ps-12 sm:max-[1479px]:ps-14">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground-1">
            <span className="text-primary font-bold">{clinicGreeting}</span>
            <span aria-hidden="true">·</span>
            <span>{formatClinicalDate(today, language)}</span>
            <span aria-hidden="true">·</span>
            <span>
              <Num value={queueCounts.total} /> {bi('موعد اليوم', 'visits today', 'سەردانی ئەمڕۆ')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {subTab === 'schedule' ? (
              <h2 className="pr-page-title">
                {bi(
                  'جدول المواعيد الأسبوعي وقائمة الانتظار',
                  'Schedule & Recurring Calendar',
                  'خشتەی مۆڵەتی هەفتانە و لیستی چاوەڕوانی'
                )}
              </h2>
            ) : (
              <h1 className="pr-page-title">
                {subTab === 'eod'
                  ? bi('إغلاق نهاية اليوم', 'End of Day Closing', 'داخستنی کۆتایی ڕۆژ')
                  : subTab === 'referrals_retention'
                  ? bi(
                      'الإحالات والمتابعة والاحتفاظ بالمرضى',
                      'Referrals & Patient Retention',
                      'ئاڕاستەکردن، بەدواداچوون و مانەوەی نەخۆشان'
                    )
                  : subTab === 'data_health'
                  ? bi(
                      'صحة البيانات وسلة المهملات (30 يوماً)',
                      'Data Health & 30-Day Recycle Bin',
                      'تەندروستیی داتا و سەبەتەی سڕاوەکان (٣٠ ڕۆژ)'
                    )
                  : bi('اليوم والطابور', 'Today & Queue', 'ئەمڕۆ و ڕیز')}
              </h1>
            )}
            {draftSessions.length > 0 && (
              <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
                · <Num value={draftSessions.length} /> {bi('مسودة غير موقعة', 'unsigned drafts', 'مسۆدەی واژوونەکراو')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
          {/* Clean Frosted Sub-navigation Pills */}
          <div className="pr-seg pr-today-tabs overflow-visible flex-wrap rounded-2xl bg-card/85 backdrop-blur-sm border-transparent shadow-xs">
            {(
              [
                { id: 'today', ar: 'اليوم', en: 'Today', ckb: 'ئەمڕۆ', icon: Clock },
                { id: 'eod', ar: 'نهاية اليوم', en: 'End of Day', ckb: 'کۆتایی ڕۆژ', icon: Banknote },
                { id: 'schedule', ar: 'الجدول الكامل', en: 'Schedule', ckb: 'خشتە', icon: Calendar },
                ...(referralsRetentionEnabled
                  ? [
                      {
                        id: 'referrals_retention' as const,
                        ar: 'الإحالات',
                        en: 'Referrals',
                        ckb: 'ئاڕاستە',
                        icon: UserCheck,
                      },
                    ]
                  : []),
                ...(dataHealthOrTrashEnabled
                  ? [
                      {
                        id: 'data_health' as const,
                        ar: 'صحة البيانات',
                        en: 'Data Health',
                        ckb: 'داتا',
                        icon: ShieldCheck,
                      },
                    ]
                  : []),
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`today-subtab-${tab.id}`}
                  aria-label={bi(tab.ar, tab.en, tab.ckb)}
                  title={bi(tab.ar, tab.en, tab.ckb)}
                  onClick={() => setSubTab(tab.id)}
                  data-active={active}
                  className="pr-seg-item"
                >
                  <Icon className="size-3.5" />
                  <span>{bi(tab.ar, tab.en, tab.ckb)}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Actions: New Patient & Privacy Blur */}
          <button
            type="button"
            onClick={() => (onOpenNewPatientModal ? onOpenNewPatientModal() : onOpenNewPatient())}
            className="min-h-[2.375rem] px-3.5 rounded-full bg-primary/12 hover:bg-primary/20 text-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <UserPlus className="size-3.5" />
            <span>{bi('مريض جديد', 'New Patient', 'نەخۆشی نوێ')}</span>
          </button>

          <button
            type="button"
            onClick={togglePrivacyBlur}
            className="size-9 rounded-full bg-card/75 hover:bg-card text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center shadow-2xs cursor-pointer transition-colors shrink-0"
            aria-label={bi('إخفاء أو إظهار أسماء المرضى', 'Privacy blur patient names', 'شاردنەوە یان پیشاندانی ناوی نەخۆشان')}
            title={bi('تمويه أسماء المرضى عن المراجعين', 'Privacy blur patient names', 'لێڵکردنی ناوی نەخۆشان لە سەردانیکەران')}
          >
            {privacyBlur ? <EyeOff className="size-4 text-primary" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {actionError && (
        <p className="px-1 text-xs font-bold text-rose-700 dark:text-rose-300">
          {actionError}
        </p>
      )}

      {/* ================================================================ */}
      {/* TAB 1: STACKED PATIENT QUEUE DECK & CLEAN DAILY TIMELINE         */}
      {/* ================================================================ */}
      {subTab === 'today' && (
        <div className="space-y-5">
          {/* Hero Stage: Centered 3-Layer Stacked Patient Deck + Clean Compact Action Strip */}
          <div className="max-w-3xl mx-auto w-full space-y-3.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-foreground/80 inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                <span>{bi('المريض الحالي والقادمون في العيادة', 'Now in Clinic & Next Queue', 'نەخۆشی ئێستا و ڕیزی دواتر')}</span>
              </span>
              {queuedAppointments.length > 0 && (
                <span dir="ltr" className="text-xs font-extrabold text-primary tabular-nums">
                  1 / {queuedAppointments.length}
                </span>
              )}
            </div>

            {queuedAppointments.length > 0 ? (
              <div className="pr-queue-deck">
                {/* Always maintain clear 2-sheet stacked backdrop depth behind real cards */}
                {queuedAppointments.length <= 2 && (
                  <div className="pr-queue-card pr-queue-card--layer-2" aria-hidden="true" />
                )}
                {queuedAppointments.length === 1 && (
                  <div className="pr-queue-card pr-queue-card--layer-1" aria-hidden="true" />
                )}

                {queuedAppointments
                  .slice(0, 3)
                  .reverse()
                  .map((cardAppt) => {
                    const stackIndex = queuedAppointments.findIndex((x) => x.id === cardAppt.id);
                    const isFront = stackIndex === 0;
                    const frontAppt = queuedAppointments[0];
                    const isExitingFront = tossExitingId !== null && frontAppt?.id === tossExitingId;
                    const isThisTossing = tossExitingId === cardAppt.id;

                    const layerClass = isThisTossing
                      ? 'pr-queue-card--front pr-queue-card--toss'
                      : isFront
                      ? `pr-queue-card--front ${dragOffsetX !== 0 ? 'pr-queue-card--dragging cursor-grabbing' : 'cursor-grab'}`
                      : isExitingFront && stackIndex === 1
                      ? 'pr-queue-card--promote'
                      : isExitingFront && stackIndex === 2
                      ? 'pr-queue-card--layer-1'
                      : stackIndex === 1
                      ? 'pr-queue-card--layer-1'
                      : 'pr-queue-card--layer-2';

                    const matchedPatient = patients.find((p) => p.id === cardAppt.patientId);
                    const isBusy = startingId === cardAppt.id;
                    const avatarInitial = cardAppt.patientName.trim().charAt(0) || 'م';

                    return (
                      <div
                        key={cardAppt.id}
                        data-testid={isFront ? 'today-active-queue-card' : undefined}
                        className={`pr-queue-card p-4 sm:p-5 ${layerClass}`}
                        aria-hidden={!isFront && !isExitingFront}
                        style={
                          isFront && !isThisTossing && dragOffsetX !== 0
                            ? {
                                transform: `translate3d(${dragOffsetX}px, ${-Math.abs(dragOffsetX) * 0.06}px, 0) rotate(${dragOffsetX * 0.035}deg)`,
                                opacity: Math.max(0.45, 1 - Math.abs(dragOffsetX) / 300),
                              }
                            : undefined
                        }
                        onPointerDown={
                          isFront && !isThisTossing
                            ? (e) => {
                                if ((e.target as HTMLElement).closest('button, a')) return;
                                dragStartXRef.current = e.clientX;
                                isDraggingCardRef.current = true;
                                try {
                                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                } catch {
                                  // ignore on synthetic events
                                }
                              }
                            : undefined
                        }
                        onPointerMove={
                          isFront && !isThisTossing
                            ? (e) => {
                                if (!isDraggingCardRef.current || dragStartXRef.current === null) return;
                                setDragOffsetX(e.clientX - dragStartXRef.current);
                              }
                            : undefined
                        }
                        onPointerUp={
                          isFront && !isThisTossing
                            ? () => {
                                if (!isDraggingCardRef.current) return;
                                isDraggingCardRef.current = false;
                                dragStartXRef.current = null;
                                if (Math.abs(dragOffsetX) >= 85) {
                                  setDragOffsetX(0);
                                  handleTossFinishCard(cardAppt);
                                } else {
                                  setDragOffsetX(0);
                                }
                              }
                            : undefined
                        }
                        onPointerCancel={
                          isFront && !isThisTossing
                            ? () => {
                                isDraggingCardRef.current = false;
                                dragStartXRef.current = null;
                                setDragOffsetX(0);
                              }
                            : undefined
                        }
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="size-12 sm:size-14 rounded-2xl bg-primary/12 text-primary font-extrabold text-lg flex items-center justify-center shrink-0">
                              {avatarInitial}
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!matchedPatient}
                                  onClick={() => matchedPatient && onOpenPatientSession(matchedPatient)}
                                  className={`text-base sm:text-lg font-extrabold text-foreground hover:text-primary transition-colors text-start truncate cursor-pointer ${
                                    privacyBlur ? 'blur-xs select-none' : ''
                                  }`}
                                >
                                  {cardAppt.patientName}
                                </button>
                                {renderStatusPill(cardAppt.status)}
                                {reEvalNudgesEnabled && reEvalDuePatientIds.has(cardAppt.patientId) && (
                                  <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
                                    · {bi('إعادة تقييم', 'Re-eval due')}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground-1 font-medium">
                                <TimeDisplay
                                  time={cardAppt.startTime}
                                  className="font-bold text-primary"
                                />
                                <span aria-hidden="true">·</span>
                                <span>
                                  <Num value={cardAppt.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')}
                                </span>
                                {cardAppt.roomOrBed && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{cardAppt.roomOrBed}</span>
                                  </>
                                )}
                                {cardAppt.episodeTitle && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <bdi dir="auto" className="truncate max-w-[14rem]">
                                      {cardAppt.episodeTitle}
                                    </bdi>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {isFront && (
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                data-testid="today-start-next-btn"
                                disabled={isBusy || !matchedPatient}
                                onClick={() => {
                                  if (matchedPatient) {
                                    void ensureAndStartSessionForPatient(matchedPatient, cardAppt, false);
                                  }
                                }}
                                className="min-h-[2.625rem] px-4 py-2 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                <Play className="size-3.5 fill-current" />
                                <span>
                                  {isBusy
                                    ? bi('جاري الفتح...', 'Opening...', 'دەکرێتەوە...')
                                    : bi('ابدأ الجلسة', 'Start Session', 'دەستپێکردن')}
                                </span>
                              </button>

                              <button
                                type="button"
                                data-testid="today-toss-next-btn"
                                disabled={tossExitingId !== null}
                                onClick={() => handleTossFinishCard(cardAppt)}
                                className="min-h-[2.625rem] px-3.5 py-2 rounded-2xl bg-primary/10 hover:bg-primary/18 text-primary text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <CheckCircle2 className="size-4" />
                                <span>{bi('إنهاء / التالي', 'Finish & Next', 'تەواو / داهاتوو')}</span>
                                <SideTossIcon className="size-3.5" />
                              </button>

                              {queuedAppointments.length > 1 && (
                                <button
                                  type="button"
                                  disabled={tossExitingId !== null}
                                  onClick={() => handleDeferFrontCard(cardAppt.id)}
                                  title={bi('تأخير للبطاقة التالية', 'Move behind next patient')}
                                  aria-label={bi('تأخير للبطاقة التالية', 'Move behind next patient')}
                                  className="size-[2.625rem] rounded-2xl bg-surface hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <SkipForward className="size-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div
                data-testid="today-active-queue-card"
                className="mt-4 rounded-[24px] bg-card p-5 sm:p-6 shadow-[0_14px_38px_-14px_rgba(15,23,42,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <h2 className="text-sm sm:text-base font-extrabold text-foreground">
                    {bi('لا توجد جلسة منتظرة الآن', 'Queue is clear right now', 'لە ئێستادا هیچ دانیشتنێک چاوەڕوان نییە')}
                  </h2>
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'أضف مراجعاً فورياً خلال 10 ثوانٍ أو افتح ملف مريض حالي من الجدول.',
                      'Add a walk-in patient in 10 seconds or pick a patient below.',
                      'لە ماوەی ١٠ چرکەدا سەردانیکەرێکی کتوپڕ زیاد بکە یان دۆسیەی نەخۆشێک بکەرەوە.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="today-start-next-btn"
                  onClick={() => setShowWalkInModal(true)}
                  className="min-h-[2.625rem] px-4 py-2 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                >
                  <UserPlus className="size-4" />
                  <span>{bi('تسجيل مراجع', 'New Walk-In', 'تۆمارکردنی سەردانیکەر')}</span>
                </button>
              </div>
            )}

            {/* Undo strip after tossing a patient card */}
            {recentCompletedUndo && (
              <div className="px-4 py-2 rounded-2xl bg-card/85 shadow-xs flex items-center justify-between gap-3 text-xs">
                <span className="text-foreground font-semibold truncate">
                  {bi(
                    `تم إنهاء موعد ${recentCompletedUndo.patientName} وانتقل الطابور للتالي`,
                    `Completed ${recentCompletedUndo.patientName} — advanced to next`,
                    `نۆرەی ${recentCompletedUndo.patientName} تەواوکرا`
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleUndoTossFinish}
                  className="px-2.5 py-1 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary font-extrabold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Undo2 className="size-3.5" />
                  <span>{bi('تراجع', 'Undo', 'گەڕانەوە')}</span>
                </button>
              </div>
            )}

            {/* Compact Clean Action Strip (replaces heavy second box card) */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
              <button
                type="button"
                data-testid="today-walkin-btn"
                onClick={() => setShowWalkInModal(true)}
                className="min-h-[2.5rem] px-4 py-2 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <UserPlus className="size-4" />
                <span>{bi('+ مراجع سريع (10 ثوانٍ)', '+ Walk-In Patient (10s)', '+ سەردانیکەری خێرا (١٠ چرکە)')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('schedule')}
                className="min-h-[2.5rem] px-4 py-2 rounded-full bg-card/85 hover:bg-card text-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <CalendarClock className="size-4 text-primary" />
                <span>{bi('حجز / متكرر', 'Book / Recur', 'نۆرە / دووبارەبوو')}</span>
              </button>
            </div>
          </div>

          {/* Pinned & Recent Patients Quick Access Strip (Borderless frosted pills, text-only DEMO) */}
          {(pinnedPatients.length > 0 || recentPatients.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-xs px-1">
              {pinnedPatients.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300">
                    <Star className="size-3.5 fill-current" />
                    <span>{bi('المثبتون:', 'Pinned:', 'چەسپاوەکان:')}</span>
                  </span>
                  {pinnedPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        ClinicOperationsService.recordPatientVisitMemory(p.id);
                        onOpenPatientSession(p);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-full bg-card/85 hover:bg-card shadow-2xs text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${privacyBlur ? 'blur-xs' : ''}`}
                    >
                      <span>{getPatientDisplayName(p.data, language)}</span>
                      {isDemoPatient(p) && <DemoBadge />}
                    </button>
                  ))}
                </div>
              )}

              {recentPatients.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 font-bold text-muted-foreground-1">
                    <History className="size-3.5" />
                    <span>{bi('الأخيرة:', 'Recent:', 'کۆتاییەکان:')}</span>
                  </span>
                  {recentPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        ClinicOperationsService.recordPatientVisitMemory(p.id);
                        onOpenPatientSession(p);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-full bg-card/85 hover:bg-card shadow-2xs text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${privacyBlur ? 'blur-xs' : ''}`}
                    >
                      <span>{getPatientDisplayName(p.data, language)}</span>
                      {isDemoPatient(p) && <DemoBadge />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter Strip + Schedule Link */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="pr-seg pr-seg-wrap bg-card/75 border-transparent shadow-2xs">
              {(
                [
                  { id: 'all', ar: 'الكل', en: 'All', ckb: 'هەموو', count: queueCounts.total },
                  { id: 'waiting', ar: 'بالانتظار', en: 'Waiting', ckb: 'چاوەڕوان', count: queueCounts.waiting },
                  { id: 'in_session', ar: 'بالجلسة', en: 'In Session', ckb: 'لە دانیشتندا', count: queueCounts.inSession },
                  { id: 'completed', ar: 'مكتمل', en: 'Completed', ckb: 'تەواوبوو', count: queueCounts.completed },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  data-active={statusFilter === f.id}
                  className="pr-seg-item"
                >
                  <span>{bi(f.ar, f.en, f.ckb)}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-surface text-xs font-bold tabular-nums">
                    <Num value={f.count} />
                  </span>
                </button>
              ))}
            </div>

            {schedulePrintEnabled && tomorrowAppointments.length > 0 && (
              <button
                type="button"
                onClick={() => setPrintTomorrowOpen(true)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-card/80 hover:bg-card shadow-2xs text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="size-3.5 text-primary" />
                <span>{bi('طباعة قائمة الغد', "Print Tomorrow's List", 'چاپکردنی لیستی سبەینێ')}</span>
              </button>
            )}
          </div>

          {/* Clean Border-Minimal Unified Timeline Surface */}
          {filteredAppointments.length === 0 ? (
            <div
              data-testid="today-empty-state"
              className="rounded-[24px] bg-card/90 p-8 text-center space-y-3 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.06)]"
            >
              <Clock className="size-8 text-primary/45 mx-auto" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  {bi(
                    'لا توجد مواعيد في هذا التصنيف لليوم',
                    'No appointments in this filter today',
                    'هیچ نۆرەیەک لەم پۆلەدا بۆ ئەمڕۆ نییە'
                  )}
                </p>
                <p className="text-xs text-muted-foreground-1 mt-1">
                  {bi(
                    'سجّل مراجعاً جديداً خلال 10 ثوانٍ أو انتقل إلى الجدول الكامل لإضافة موعد متكرر.',
                    'Register a quick walk-in in 10 seconds or open Full Schedule to book visits.',
                    'لە ماوەی ١٠ چرکەدا سەردانیکەرێکی نوێ تۆمار بکە یان بڕۆ خشتەی تەواو بۆ زیادکردنی نۆرە.'
                  )}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  data-testid="today-empty-primary-btn"
                  onClick={() => setShowWalkInModal(true)}
                  className="min-h-[40px] px-4 py-2 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <UserPlus className="size-4" />
                  <span>
                    {bi('+ تسجيل مراجع سريع الآن', '+ Register Walk-In Now', '+ تۆمارکردنی سەردانیکەری خێرا ئێستا')}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] bg-card/95 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)] divide-y divide-border/15 overflow-hidden">
              {filteredAppointments.map((appt) => {
                const matchedPatient = patients.find((p) => p.id === appt.patientId);
                const isBusy = startingId === appt.id;
                const demoFlag = appt.isDemo || (matchedPatient ? isDemoPatient(matchedPatient) : false);
                return (
                  <div
                    key={appt.id}
                    data-testid={`today-row-${appt.id}`}
                    className="p-3.5 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-primary/[0.025] transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Soft Borderless Time Pill */}
                      <div className="px-3 py-2 rounded-2xl bg-primary/[0.07] text-center shrink-0 min-w-[78px]">
                        <TimeDisplay
                          time={appt.startTime}
                          className="text-sm font-extrabold text-primary justify-center"
                        />
                        <span className="text-xs text-muted-foreground-1 font-medium block">
                          <Num value={appt.durationMinutes} /> {bi('د', 'm', 'خ')}
                        </span>
                      </div>

                      {/* Patient & Context */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => matchedPatient && onOpenPatientSession(matchedPatient)}
                            className={`text-sm font-extrabold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                              privacyBlur ? 'blur-xs select-none' : ''
                            }`}
                          >
                            <span>{appt.patientName}</span>
                            <ArrowOpenIcon className="size-3.5 text-muted-foreground-2" />
                          </button>
                          {renderStatusPill(appt.status)}
                          {reEvalNudgesEnabled && reEvalDuePatientIds.has(appt.patientId) && (
                            <span
                              data-testid="today-reeval-due-badge"
                              className="text-xs font-extrabold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
                            >
                              <CalendarClock className="size-3.5" />
                              <span>
                                {bi(
                                  'إعادة تقييم مستحقة',
                                  'Re-eval due',
                                  'پێویستی بە هەڵسەنگاندنەوە هەیە'
                                )}
                              </span>
                            </span>
                          )}
                          {demoFlag && <DemoBadge />}
                          {matchedPatient && (
                            <span className="text-xs font-mono text-muted-foreground-2">
                              {getPatientMrn(matchedPatient)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground-1">
                          {(appt.therapistName || ClinicOperationsService.getClinicProfile().therapistNameAr || ClinicOperationsService.getStaffRoster()[0]?.nameAr) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface text-foreground font-semibold text-xs">
                              <Stethoscope className="size-3 text-primary" />
                              <span>{appt.therapistName || ClinicOperationsService.getClinicProfile().therapistNameAr || ClinicOperationsService.getStaffRoster()[0]?.nameAr}</span>
                            </span>
                          )}
                          {appt.patientPhone && (
                            <bdi dir="ltr" className="font-mono">
                              {formatIraqiPhoneDisplay(appt.patientPhone)}
                            </bdi>
                          )}
                          <span>· {appt.roomOrBed}</span>
                          {appt.episodeTitle && (
                            <span>
                              · <bdi dir="auto">{appt.episodeTitle}</bdi>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row Quick Actions: Arrived / Start / Finish & Collect */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {appt.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => handleRowStatus(appt.id, 'arrived')}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover text-amber-700 dark:text-amber-300 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <UserCheck className="size-3.5" />
                          <span>{bi('وصل', 'Arrived', 'گەیشت')}</span>
                        </button>
                      )}

                      {matchedPatient && appt.status !== 'completed' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void ensureAndStartSessionForPatient(matchedPatient, appt, false)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="size-3.5 fill-current" />
                          <span>
                            {isBusy
                              ? bi('جاري الفتح...', 'Opening...', 'دەکرێتەوە...')
                              : bi('ابدأ الجلسة', 'Start', 'دەستپێکردن')}
                          </span>
                        </button>
                      )}

                      {matchedPatient && appt.status !== 'completed' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void ensureAndStartSessionForPatient(matchedPatient, appt, true)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl hover:bg-surface/80 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>{bi('إنهاء وتحصيل', 'Finish & Collect', 'تەواوکردن و وەرگرتن')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phase F2: Dismissible 4-Step Clinic Onboarding Checklist */}
          {!onboardingSummary.isDismissed ? (
            <div
              data-testid="onboarding-checklist-card"
              className="p-4 sm:p-5 rounded-[24px] bg-card/90 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.06)] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary shrink-0" />
                  <h2 className="text-xs sm:text-sm font-extrabold text-foreground">
                    {bi(
                      'قائمة البدء السريع لإعداد العيادة',
                      'Clinic Onboarding Checklist',
                      'لیستی دەستپێکی خێرا بۆ ڕێکخستنی کلینیک'
                    )}
                  </h2>
                  <span
                    data-testid="onboarding-checklist-progress"
                    dir="ltr"
                    className="text-xs font-mono font-extrabold text-primary tabular-nums"
                  >
                    {onboardingSummary.completedCount} / {onboardingSummary.totalCount}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="onboarding-checklist-dismiss-btn"
                  onClick={() => {
                    setChecklistDismissed(true);
                    void ClinicOperationsService.setOnboardingChecklistDismissedAsync(true);
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-full bg-surface hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground text-xs font-bold cursor-pointer"
                >
                  {bi('إخفاء القائمة', 'Dismiss', 'شاردنەوەی لیست')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {onboardingSummary.steps.map((step) => {
                  const stepCkb = ONBOARDING_STEP_CKB[step.id];
                  return (
                    <div
                      key={step.id}
                      data-testid={`onboarding-step-${step.id}`}
                      className={`p-3 rounded-2xl flex flex-col justify-between gap-2.5 ${
                        step.completed
                          ? 'bg-primary/[0.06]'
                          : 'bg-surface/80'
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
                            if (onOpenNewPatientModal) {
                              onOpenNewPatientModal();
                            } else {
                              setShowWalkInModal(true);
                            }
                          } else if (step.id === 'first_backup') {
                            if (onOpenBackupModal) {
                              onOpenBackupModal();
                            } else {
                              onOpenBackup();
                            }
                          } else if (step.id === 'verify_recovery_key') {
                            onOpenRecoveryDrill?.();
                          }
                        }}
                        className={`min-h-[36px] w-full px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                          step.completed
                            ? 'bg-surface/70 hover:bg-surface text-foreground'
                            : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                        }`}
                      >
                        {step.completed && <Check className="size-3.5 text-emerald-700 dark:text-emerald-300" />}
                        <span>{bi(step.ctaAr, step.ctaEn, stepCkb?.cta)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            !onboardingSummary.allCompleted && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  data-testid="onboarding-checklist-restore-btn"
                  onClick={() => {
                    setChecklistDismissed(false);
                    void ClinicOperationsService.setOnboardingChecklistDismissedAsync(false);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-full bg-surface/75 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="size-3.5 text-primary" />
                  <span>
                    {bi(
                      `إظهار قائمة إعداد العيادة (${onboardingSummary.completedCount}/4)`,
                      `Show Onboarding Checklist (${onboardingSummary.completedCount}/4)`,
                      `پیشاندانی لیستی ڕێکخستنی کلینیک (${onboardingSummary.completedCount}/4)`
                    )}
                  </span>
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: END OF DAY CLOSING SCREEN (2.5)                           */}
      {/* ================================================================ */}
      {subTab === 'eod' && (
        <div className="space-y-4">
          {/* 1. Cash & Collections Summary + 10s Backup Trigger */}
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
                  <Money amount={todayFinanceSummary.expensesIQD} className="text-sm font-extrabold text-rose-700 dark:text-rose-300" />
                </div>
                <div className="px-1 py-1.5 flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {bi('صافي الصندوق:', 'Net Cash:', 'پوختەی سندووق:')}
                  </span>
                  <Money amount={todayFinanceSummary.netCashIQD} className="text-sm font-extrabold text-primary" />
                </div>
              </div>
            </div>

            {/* Backup Now (10s) Card */}
            <div className="lg:col-span-4 p-4 pr-surface flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{bi('حماية بيانات نهاية اليوم', 'Daily Encrypted Backup', 'پاراستنی داتای کۆتایی ڕۆژ')}</span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'احفظ نسخة مشفرة مضغوطة (v3.0) لبيانات مرضاك ومدفوعات اليوم على جهازك أو القرص الخارجي في ثوانٍ.',
                    'Save a compressed chunked AES-GCM backup (.ptbackup) of today’s clinical & billing records in seconds.',
                    'لە چەند چرکەیەکدا کۆپییەکی یەدەگی کۆدکراو (.ptbackup) بۆ تۆمارە پزیشکی و داراییەکانی ئەمڕۆ لەسەر ئامێرەکەت پاشەکەوت بکە.'
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
                <span>{bi('نسخ احتياطي الآن (10 ثوانٍ)', 'Backup now (10 s)', 'پاشەکەوتکردن ئێستا (١٠ چرکە)')}</span>
              </button>
            </div>
          </div>

          {/* 2. Unsigned / Draft Notes Checklist */}
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
                  'نایابە! هەموو دانیشتنەکانت پەسەندکراون و واژۆکراون و هیچ مسۆدەیەک نەماوەتەوە.'
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
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg hover:bg-surface/80 text-amber-700 dark:text-amber-300 font-bold cursor-pointer shrink-0 transition-colors"
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

          {/* 3. Tomorrow's Schedule + WhatsApp Reminders */}
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
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-surface/65 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
                          <TimeDisplay
                            time={appt.startTime}
                            className="font-extrabold text-primary"
                          />
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
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-surface/65 hover:bg-surface text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
                            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold inline-flex items-center gap-1.5"
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
      {/* TAB 3: FULL WEEKLY / RECURRING CALENDAR & WAITLIST               */}
      {/* ================================================================ */}
      {subTab === 'schedule' && (
        <AppointmentScheduleView onNewPatient={onOpenNewPatient} privacyBlur={privacyBlur} />
      )}

      {/* ================================================================ */}
      {/* TAB 4: REFERRALS & RETENTION LISTS (PHASE C6-C7, LAZY-LOADED)    */}
      {/* ================================================================ */}
      {subTab === 'referrals_retention' && referralsRetentionEnabled && (
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi(
                'جاري تحميل الإحالات وقوائم المتابعة...',
                'Loading Referrals & Retention...',
                'بارکردنی ئاڕاستەکردن و لیستەکانی بەدواداچوون...'
              )}
            </div>
          }
        >
          <ReferralsAndRetentionPanel
            onOpenPatientChart={(patient) => onOpenPatientSession(patient, null, false)}
          />
        </Suspense>
      )}

      {/* ================================================================ */}
      {/* TAB 5: DATA HEALTH & 30-DAY RECYCLE BIN (PHASE D3-D4, LAZY)      */}
      {/* ================================================================ */}
      {subTab === 'data_health' && dataHealthOrTrashEnabled && (
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi(
                'جاري تحميل فحص صحة البيانات والسلة...',
                'Loading Data Health & Recycle Bin...',
                'بارکردنی پشکنینی تەندروستیی داتا و سەبەتە...'
              )}
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
