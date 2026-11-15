// =======================================================================
// PhysioRecord — Today Command Center & End-of-Day Screen (Phase 2.1, 2.2, 2.5, 2.6, 2.7, 2.8)
// Merged Reception + Schedule + Walk-in Quick-Add + End-of-Day Closing +
// Pinned/Recent Smart Memory + Thumb-Reach Mobile Action Bar
// =======================================================================

import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
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

  // Next actionable appointment for the Hero "Start Next Session" CTA
  const nextUpAppointment = useMemo(() => {
    const active = todayAppointments.filter((a) => a.status !== 'cancelled' && a.status !== 'completed');
    return (
      active.find((a) => a.status === 'arrived') ||
      active.find((a) => a.status === 'scheduled') ||
      active.find((a) => a.status === 'in_session') ||
      null
    );
  }, [todayAppointments]);

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
        cls: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30',
      },
      arrived: {
        ar: 'وصل / بالانتظار',
        en: 'Arrived',
        ckb: 'گەیشت / چاوەڕوانە',
        cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
      },
      in_session: {
        ar: 'داخل الجلسة',
        en: 'In Session',
        ckb: 'لە دانیشتندایە',
        cls: 'bg-primary/15 text-primary border-primary/35',
      },
      completed: {
        ar: 'منتهي',
        en: 'Completed',
        ckb: 'تەواوبوو',
        cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      },
      cancelled: {
        ar: 'ملغي',
        en: 'Cancelled',
        ckb: 'هەڵوەشاوەتەوە',
        cls: 'bg-muted text-muted-foreground-2 border-line-2',
      },
      no_show: {
        ar: 'لم يحضر',
        en: 'No Show',
        ckb: 'نەهات',
        cls: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30',
      },
    };
    const info = styles[status] || styles.scheduled;
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${info.cls}`}>
        {bi(info.ar, info.en, info.ckb)}
      </span>
    );
  };

  const ArrowOpenIcon = isRtl ? ArrowUpLeft : ArrowUpRight;

  return (
    <div className="max-w-[85rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-3 sm:space-y-4 pb-6">
      {/* Contextual Onboarding Tip (2.8) */}
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

      {/* Top Mode Switcher Header: Today | End of Day | Full Schedule */}
      <div className="pr-page-header">
        <div className="space-y-1 min-w-0">
          <span className="pr-eyebrow">
            <Sparkles className="size-3.5" />
            {bi('مركز قيادة العيادة', 'Clinic command center', 'ناوەندی فەرماندەیی کلینیک')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
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
                  : bi('اليوم — جدول الجلسات الفوري', 'Today — Daily Timeline', 'ئەمڕۆ — خشتەی ڕاستەوخۆی دانیشتنەکان')}
              </h1>
            )}
            {draftSessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold">
                <Num value={draftSessions.length} /> {bi('مسودة غير موقعة', 'unsigned drafts', 'مسۆدەی واژوونەکراو')}
              </span>
            )}
          </div>
          <p className="pr-page-subtitle">
            {formatClinicalDate(today, language)} ·{' '}
            <Num value={queueCounts.total} /> {bi('موعد اليوم', 'visits today', 'سەردانی ئەمڕۆ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto min-w-0">
          {/* Sub-navigation pills */}
          <div className="pr-seg pr-today-tabs min-w-0 flex-1 md:flex-none">
            {(
              [
                { id: 'today', ar: 'اليوم', en: 'Today', ckb: 'ئەمڕۆ', icon: Clock },
                { id: 'eod', ar: 'نهاية اليوم', en: 'End of Day', ckb: 'کۆتایی ڕۆژ', icon: Banknote },
                { id: 'schedule', ar: 'الجدول الكامل', en: 'Full Schedule', ckb: 'خشتەی تەواو', icon: Calendar },
                ...(referralsRetentionEnabled
                  ? [
                      {
                        id: 'referrals_retention' as const,
                        ar: 'الإحالات والمتابعة',
                        en: 'Referrals & Retention',
                        ckb: 'ئاڕاستە و بەدواداچوون',
                        icon: UserCheck,
                      },
                    ]
                  : []),
                ...(dataHealthOrTrashEnabled
                  ? [
                      {
                        id: 'data_health' as const,
                        ar: 'صحة البيانات والسلة',
                        en: 'Data Health & Trash',
                        ckb: 'تەندروستیی داتا و سەبەتە',
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

          <button
            type="button"
            onClick={togglePrivacyBlur}
            className="pr-btn pr-btn-ghost min-h-[2.25rem] px-3"
            aria-label={bi('إخفاء أو إظهار أسماء المرضى', 'Privacy blur patient names', 'شاردنەوە یان پیشاندانی ناوی نەخۆشان')}
            title={bi('إخفاء أو إظهار أسماء المرضى عن المراجعين', 'Privacy blur patient names', 'لێڵکردنی ناوی نەخۆشان لە سەردانیکەران')}
          >
            {privacyBlur ? <EyeOff className="size-4 text-primary" /> : <Eye className="size-4" />}
            <span className="hidden sm:inline">
              {privacyBlur
                ? bi('وضع الخصوصية مفعل', 'Privacy Blur On', 'دۆخی نهێنی چالاکە')
                : bi('تمويه الأسماء', 'Privacy Blur', 'لێڵکردنی ناوەکان')}
            </span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {actionError}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 1: TODAY TIMELINE & QUICK ACTIONS (2.2)                      */}
      {/* ================================================================ */}
      {subTab === 'today' && (
        <div className="space-y-3 sm:space-y-4">
          {/* Primary CTA Row: Compact strip on mobile so queue stays above the fold; split cards on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
            <div className="md:col-span-7 pr-hero p-3 sm:p-5 flex items-center justify-between gap-2.5 sm:gap-4">
              <div className="space-y-0.5 min-w-0">
                <span className="hidden sm:inline-flex text-xs font-bold text-primary items-center gap-1">
                  <Sparkles className="size-3.5" />
                  <span>{bi('الجلسة التالية في الطابور', 'Up Next on Schedule', 'دانیشتنی داهاتوو لە ڕیزدا')}</span>
                </span>
                {nextUpAppointment ? (
                  <>
                    <h2 className={`text-sm sm:text-base font-extrabold text-foreground leading-snug ${privacyBlur ? 'blur-xs select-none' : ''}`}>
                      {nextUpAppointment.patientName}
                    </h2>
                    <p className="text-xs text-muted-foreground-1 flex flex-wrap items-center gap-1.5">
                      <TimeDisplay
                        time={nextUpAppointment.startTime}
                        className="font-bold text-primary"
                      />
                      <span>·</span>
                      <span>
                        <Num value={nextUpAppointment.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')}
                      </span>
                      <span className="hidden sm:inline">· {nextUpAppointment.roomOrBed}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm sm:text-base font-extrabold text-foreground">
                      {bi('لا توجد جلسة منتظرة الآن', 'Queue is clear right now', 'لە ئێستادا هیچ دانیشتنێک چاوەڕوان نییە')}
                    </h2>
                    <p className="hidden sm:block text-xs text-muted-foreground-1">
                      {bi(
                        'أضف مراجعاً فورياً خلال 10 ثوانٍ أو افتح ملف مريض حالي.',
                        'Add a walk-in patient in 10 seconds or pick a patient below.',
                        'لە ماوەی ١٠ چرکەدا سەردانیکەرێکی کتوپڕ زیاد بکە یان دۆسیەی نەخۆشێکی ئێستا بکەرەوە.'
                      )}
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                data-testid="today-start-next-btn"
                disabled={startingId !== null || (!nextUpAppointment && activePatients.length === 0)}
                onClick={() => {
                  if (nextUpAppointment) {
                    const matched = patients.find((p) => p.id === nextUpAppointment.patientId);
                    if (matched) {
                      void ensureAndStartSessionForPatient(matched, nextUpAppointment, false);
                    }
                  } else {
                    setShowWalkInModal(true);
                  }
                }}
                className="pr-btn pr-btn-primary min-h-[2.5rem] sm:min-h-[2.875rem] px-3.5 sm:px-5 shrink-0"
              >
                <Play className="size-3.5 sm:size-4 fill-current" />
                <span>
                  {nextUpAppointment
                    ? bi('ابدأ التالي', 'Start Next', 'دەستپێکردنی داهاتوو')
                    : bi('تسجيل مراجع', 'New Walk-In', 'تۆمارکردنی سەردانیکەر')}
                </span>
              </button>
            </div>

            <div className="md:col-span-5 pr-surface p-3 sm:p-5 flex flex-col justify-between gap-2 sm:gap-3">
              <div className="hidden sm:flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-foreground">
                    {bi('مراجع مفاجئ / تسجيل سريع', 'Quick Walk-In (10s)', 'نەخۆشی کتوپڕ / تۆماری خێرا')}
                  </h2>
                  <p className="text-xs text-muted-foreground-1 mt-0.5">
                    {bi(
                      'الاسم والهاتف فقط ← مريض + موعد + جلسة مفتوحة',
                      'Name + Phone → Patient + Visit + Session in one step',
                      'تەنها ناو و مۆبایل ← نەخۆش + نۆرە + دانیشتنی کراوە'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="today-walkin-btn"
                  onClick={() => setShowWalkInModal(true)}
                  className="pr-btn pr-btn-primary flex-1 min-h-[2.5rem] sm:min-h-[2.75rem] px-3.5 sm:px-4"
                >
                  <UserPlus className="size-4" />
                  <span>{bi('+ مراجع سريع (10 ثوانٍ)', '+ Walk-In Patient (10s)', '+ سەردانیکەری خێرا (١٠ چرکە)')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('schedule')}
                  className="min-h-[40px] sm:min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CalendarClock className="size-4 text-primary" />
                  <span>{bi('حجز / متكرر', 'Book / Recur', 'نۆرە / دووبارەبوو')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pinned & Recent Patients Quick Access Bar (2.6) */}
          {(pinnedPatients.length > 0 || recentPatients.length > 0) && (
            <div className="p-2.5 sm:p-3.5 pr-surface space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {pinnedPatients.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 font-bold text-amber-800 dark:text-amber-300">
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
                        className={`min-h-[36px] px-2.5 py-1 rounded-full bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/30 text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${privacyBlur ? 'blur-xs' : ''}`}
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
                        className={`min-h-[36px] px-2.5 py-1 rounded-full bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${privacyBlur ? 'blur-xs' : ''}`}
                      >
                        <span>{getPatientDisplayName(p.data, language)}</span>
                        {isDemoPatient(p) && <DemoBadge />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="pr-seg pr-seg-wrap">
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
          </div>

          {/* Today Timeline List */}
          {filteredAppointments.length === 0 ? (
            <div
              data-testid="today-empty-state"
              className="pr-surface p-8 text-center space-y-3"
            >
              <Clock className="size-8 text-muted-foreground-2 mx-auto" />
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
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <UserPlus className="size-4" />
                  <span>
                    {bi('+ تسجيل مراجع سريع الآن', '+ Register Walk-In Now', '+ تۆمارکردنی سەردانیکەری خێرا ئێستا')}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAppointments.map((appt) => {
                const matchedPatient = patients.find((p) => p.id === appt.patientId);
                const isBusy = startingId === appt.id;
                const demoFlag = appt.isDemo || (matchedPatient ? isDemoPatient(matchedPatient) : false);
                return (
                  <div
                    key={appt.id}
                    data-testid={`today-row-${appt.id}`}
                    className="pr-surface pr-surface-interactive p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Time Column */}
                      <div className="px-3 py-2 rounded-xl bg-[var(--pr-accent-softer)] border border-[var(--pr-accent-line)] text-center shrink-0 min-w-[82px]">
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
                              className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 inline-flex items-center gap-1"
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-layer-line text-foreground font-semibold text-xs">
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
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
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
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600/12 hover:bg-emerald-600/20 border border-emerald-600/35 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border-line-2 disabled:cursor-not-allowed"
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
              className="p-3.5 sm:p-4 pr-surface border-[var(--pr-accent-line)] space-y-3"
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
                    className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono font-bold tabular-nums"
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
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-muted-foreground-1 hover:text-foreground text-xs font-bold cursor-pointer"
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
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                        step.completed
                          ? 'bg-emerald-500/8 border-emerald-500/30'
                          : 'bg-surface border-line-2'
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
                            ? 'bg-layer hover:bg-layer-hover border border-layer-line text-foreground'
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
                  className="min-h-[36px] px-3 py-1.5 rounded-full bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
              <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-surface border border-line-2">
                  <span className="text-muted-foreground-1 block mb-1">{bi('نقداً', 'Cash', 'کاش')}</span>
                  <Money amount={todayFinanceSummary.byMethod.cash} className="text-sm font-extrabold" />
                </div>
                <div className="p-3 rounded-xl bg-surface border border-line-2">
                  <span className="text-muted-foreground-1 block mb-1">ZainCash</span>
                  <Money amount={todayFinanceSummary.byMethod.zain_cash} className="text-sm font-extrabold" />
                </div>
                <div className="p-3 rounded-xl bg-surface border border-line-2">
                  <span className="text-muted-foreground-1 block mb-1">QiCard</span>
                  <Money amount={todayFinanceSummary.byMethod.qi_card} className="text-sm font-extrabold" />
                </div>
                <div className="p-3 rounded-xl bg-surface border border-line-2">
                  <span className="text-muted-foreground-1 block mb-1">{bi('أخرى', 'Other', 'هیتر')}</span>
                  <Money amount={todayFinanceSummary.byMethod.other} className="text-sm font-extrabold" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/25 flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {bi('إجمالي المقبوضات:', 'Total Collected:', 'کۆی وەرگیراو:')}
                  </span>
                  <Money amount={todayFinanceSummary.totalCollectedIQD} className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300" />
                </div>
                <div className="p-3 rounded-xl bg-rose-500/8 border border-rose-500/25 flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {bi('مصاريف اليوم:', 'Today Expenses:', 'خەرجییەکانی ئەمڕۆ:')}
                  </span>
                  <Money amount={todayFinanceSummary.expensesIQD} className="text-sm font-extrabold text-rose-700 dark:text-rose-300" />
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {bi('صافي الصندوق:', 'Net Cash:', 'پوختەی سندووق:')}
                  </span>
                  <Money amount={todayFinanceSummary.netCashIQD} className="text-sm font-extrabold text-primary" />
                </div>
              </div>
            </div>

            {/* Backup Now (10s) Card */}
            <div className="lg:col-span-4 p-4 rounded-2xl bg-gradient-to-br from-primary/12 via-card to-card border border-primary/25 flex flex-col justify-between gap-3">
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
            <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {draftSessions.map((draft) => {
                  const p = patients.find((pt) => pt.id === draft.patientId);
                  const name = p ? getPatientDisplayName(p.data, language) : draft.patientId;
                  return (
                    <div
                      key={draft.id}
                      className="p-3 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2 text-xs"
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
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-800 dark:text-amber-300 font-bold cursor-pointer shrink-0"
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider pb-2.5">
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
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
              <div className="space-y-2">
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
                      className="p-3 rounded-xl bg-surface border border-line-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
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
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
