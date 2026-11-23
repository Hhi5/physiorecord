// =======================================================================
// PhysioRecord — Pre-Session Brief Panel & Loader
// Surfaces Red Flags/Precautions, Last SOAP Summary & Plan, Package/Balance,
// and Single Primary Action right before entering treatment (zero extra clicks).
// =======================================================================

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Play,
  SkipForward,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { SoapService } from '../../services/soapService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { ClinicAppointment } from '../../types/clinicManagement';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import {
  computePatientAge,
  formatDateDDMMYYYY,
  formatIraqiPhoneDisplay,
} from '../../utils/date';
import {
  getPatientDisplayName,
  getPatientMrn,
  hasPatientRedFlagsOrContraindications,
  isMeaningfulClinicalAlertText,
} from '../../utils/mrn';
import { DemoBadge, Money, Num, TimeDisplay } from '../ui/Primitives';

export interface PreSessionBriefState {
  loading: boolean;
  fullPatient: PatientRecord | null;
  activeEpisode: EpisodeRecord | null;
  sessionsCount: number;
  draftSession: SessionRecord | null;
  latestSoap: SoapNoteRecord | null;
  latestSoapSessionNumber?: number;
  latestSoapSessionDate?: string;
}

export function usePreSessionBrief(
  appt: ClinicAppointment | null,
  fallbackPatient: PatientRecord | undefined,
  opsVersion: number
): PreSessionBriefState {
  const { dek } = useVault();
  const { loadFullPatientById } = usePatients();

  const [state, setState] = useState<PreSessionBriefState>({
    loading: false,
    fullPatient: fallbackPatient ?? null,
    activeEpisode: null,
    sessionsCount: 0,
    draftSession: null,
    latestSoap: null,
  });

  useEffect(() => {
    if (!appt || !dek) {
      setState({
        loading: false,
        fullPatient: fallbackPatient ?? null,
        activeEpisode: null,
        sessionsCount: 0,
        draftSession: null,
        latestSoap: null,
      });
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      ...prev,
      loading: true,
      fullPatient:
        prev.fullPatient?.id === appt.patientId
          ? prev.fullPatient
          : fallbackPatient ?? null,
    }));

    void (async () => {
      try {
        const [loadedPatient, episodes] = await Promise.all([
          loadFullPatientById(appt.patientId).catch(() => fallbackPatient ?? null),
          EpisodeService.getEpisodesByPatient(appt.patientId, dek).catch(() => []),
        ]);

        const activeEpisode =
          (appt.episodeId
            ? episodes.find((e) => e.id === appt.episodeId)
            : undefined) ||
          episodes.find(
            (e) => e.data.status !== 'completed' && e.data.status !== 'archived'
          ) ||
          episodes[0] ||
          null;

        let sessionsCount = 0;
        let draftSession: SessionRecord | null = null;
        let latestSoap: SoapNoteRecord | null = null;
        let latestSoapSessionNumber: number | undefined;
        let latestSoapSessionDate: string | undefined;

        if (activeEpisode) {
          const sessions = await SessionService.getSessionsByEpisode(
            activeEpisode.id,
            dek
          ).catch(() => []);
          const validSessions = sessions.filter((s) => s.data.status !== 'cancelled');
          sessionsCount = validSessions.length;
          draftSession =
            validSessions.find((s) => s.data.status === 'draft') || null;

          // Fetch most recent documented SOAP across episode (including previous finalized or draft note)
          const soapRes = await SoapService.getLatestEpisodeSoapNote(
            activeEpisode.id,
            undefined,
            dek
          ).catch(() => null);

          latestSoap = soapRes?.soapNote ?? null;
          latestSoapSessionNumber = soapRes?.sourceSessionNumber;
          latestSoapSessionDate = soapRes?.sourceSessionDate;
        }

        if (!cancelled) {
          setState({
            loading: false,
            fullPatient: loadedPatient || fallbackPatient || null,
            activeEpisode,
            sessionsCount,
            draftSession,
            latestSoap,
            latestSoapSessionNumber,
            latestSoapSessionDate,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            fullPatient: fallbackPatient ?? null,
            activeEpisode: null,
            sessionsCount: 0,
            draftSession: null,
            latestSoap: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appt?.id, appt?.patientId, appt?.episodeId, dek, opsVersion, fallbackPatient, loadFullPatientById]);

  return state;
}

export interface TodayPreSessionBriefProps {
  variant: 'desktop' | 'inline-mobile';
  appt: ClinicAppointment | null;
  patient: PatientRecord | undefined;
  brief: PreSessionBriefState;
  privacyBlur: boolean;
  isBusy: boolean;
  reEvalDue: boolean;
  canSkipToNext: boolean;
  statusPill: React.ReactNode;
  onStartSession: () => void;
  onFinishAndCollect: () => void;
  onCompleteAdvance: () => void;
  onMarkArrived: () => void;
  onSkipToNext: () => void;
  onOpenChart: () => void;
  onOpenWalkIn: () => void;
}

export const TodayPreSessionBrief: React.FC<TodayPreSessionBriefProps> = ({
  variant,
  appt,
  patient,
  brief,
  privacyBlur,
  isBusy,
  reEvalDue,
  canSkipToNext,
  statusPill,
  onStartSession,
  onFinishAndCollect,
  onCompleteAdvance,
  onMarkArrived,
  onSkipToNext,
  onOpenChart,
  onOpenWalkIn,
}) => {
  const { language, isRtl, bi } = useLanguage();

  if (!appt) {
    if (variant === 'inline-mobile') return null;
    return (
      <div
        data-testid="today-prebrief-empty"
        className="pr-surface rounded-[24px] p-8 text-center space-y-3"
      >
        <ClipboardList className="size-8 text-primary/45 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-extrabold text-foreground">
            {bi(
              'القائمة صافية الآن',
              'Schedule is clear right now',
              'خشتەی ئەمڕۆ لە ئێستادا بەتاڵە'
            )}
          </h2>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'سجّل مراجعاً مفاجئاً خلال 10 ثوانٍ أو اختر موعداً من القائمة لعرض ملخص ما قبل الجلسة.',
              'Register a 10s walk-in or select an appointment to view their pre-session clinical brief.',
              'لە ماوەی ١٠ چرکەدا سەردانیکەرێکی کتوپڕ تۆمار بکە یان نۆرەیەک هەڵبژێرە.'
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="today-start-next-btn"
          onClick={onOpenWalkIn}
          className="min-h-[42px] px-4 py-2 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <UserPlus className="size-4" />
          <span>{bi('تسجيل مراجع سريع (10 ثوانٍ)', 'Walk-In Patient (10s)', 'تۆمارکردنی سەردانیکەری خێرا')}</span>
        </button>
      </div>
    );
  }

  const effectivePatient = brief.fullPatient || patient;
  const pData = effectivePatient?.data;
  const displayName = pData
    ? getPatientDisplayName(pData, language)
    : appt.patientName;
  const mrn = effectivePatient ? getPatientMrn(effectivePatient) : null;
  const age = pData ? computePatientAge(pData.dateOfBirth, pData.age) : undefined;
  const phone = pData?.phone || pData?.phoneNumber || appt.patientPhone || '';
  const isDemo = Boolean(appt.isDemo || pData?.isDemo);

  // Extract concise clinical alerts (Red Flags, Allergies, Precautions, Contraindications)
  const checklistAlerts =
    pData?.redFlagChecklist
      ?.filter((c) => c.status === 'present')
      .map((c) => bi(c.labelAr, c.labelEn)) ?? [];
  const alertLines: Array<{ label: string; text: string; tone: 'danger' | 'warn' }> = [];
  if (pData && hasPatientRedFlagsOrContraindications(pData)) {
    if (isMeaningfulClinicalAlertText(pData.redFlags)) {
      alertLines.push({
        label: bi('علامة خطر:', 'Red Flag:', 'ئاڵای سوور:'),
        text: (pData.redFlags ?? '').trim(),
        tone: 'danger',
      });
    }
    if (checklistAlerts.length > 0) {
      alertLines.push({
        label: bi('فحص تحذيري:', 'Flag:', 'ئاگادارکردنەوە:'),
        text: checklistAlerts.join(' · '),
        tone: 'danger',
      });
    }
    if (isMeaningfulClinicalAlertText(pData.contraindications)) {
      alertLines.push({
        label: bi('ممنوعات:', 'Contraindication:', 'قەدەغەکراو:'),
        text: (pData.contraindications ?? '').trim(),
        tone: 'danger',
      });
    }
    if (isMeaningfulClinicalAlertText(pData.precautions)) {
      alertLines.push({
        label: bi('محاذير:', 'Precaution:', 'وریایی:'),
        text: (pData.precautions ?? '').trim(),
        tone: 'warn',
      });
    }
  }
  if (
    pData &&
    isMeaningfulClinicalAlertText(pData.allergies) &&
    !/^(لا\s*يوجد|لا\s*توجد|بدون\s*حساسية|no\s+known|nkda)(?:\s|$|[.:،,])/i.test(
      (pData.allergies ?? '').trim()
    )
  ) {
    alertLines.push({
      label: bi('حساسية:', 'Allergy:', 'هەستیاری:'),
      text: (pData.allergies ?? '').trim(),
      tone: 'warn',
    });
  }

  // Synchronous patient invoices summary (IQD debt & active package sessions)
  const patientInvoices = ClinicOperationsService.getInvoicesIQD().filter(
    (inv) => inv.patientId === appt.patientId && inv.status !== 'void'
  );
  const totalDebtIQD = patientInvoices.reduce(
    (sum, inv) => sum + (inv.balanceDueIQD || 0),
    0
  );
  const activePkg = patientInvoices.find(
    (inv) =>
      inv.invoiceType === 'rehab_package' &&
      typeof inv.packageTotalSessions === 'number' &&
      inv.packageTotalSessions > 0
  );

  // Latest SOAP snippets
  const soap = brief.latestSoap?.data;
  const prePain = soap?.subjective?.painNrsScore ?? soap?.subjective?.painAssessment?.score;
  const postPain = soap?.subjective?.postSessionPainNrs;
  const soapComplaint = soap?.subjective?.chiefComplaint?.trim();
  const soapImpression = soap?.assessment?.clinicalImpressionCurrent?.trim();
  const soapNextPlan = soap?.plan?.nextSessionPlan?.trim();
  const soapExercisesCount = soap?.objective?.flowsheet?.exercises?.length ?? 0;
  const soapInterventions = soap?.objective?.dailyInterventionsSummary?.trim();

  const ArrowOpenIcon = isRtl ? ArrowUpLeft : ArrowUpRight;
  const primaryActionLabel = isBusy
    ? bi('جاري الفتح...', 'Opening...', 'دەکرێتەوە...')
    : brief.draftSession
      ? bi('استئناف الجلسة', 'Resume Session', 'بەردەوامبوون لە دانیشتن')
      : appt.status === 'completed'
        ? bi('مراجعة الجلسة', 'Review Session', 'پێداچوونەوەی دانیشتن')
        : bi('ابدأ الجلسة', 'Start Session', 'دەستپێکردنی دانیشتن');

  // -------------------------------------------------------------------
  // VARIANT A: COMPACT INLINE MOBILE EXPANSION (inside focused row)
  // -------------------------------------------------------------------
  if (variant === 'inline-mobile') {
    return (
      <div
        data-testid="today-inline-prebrief"
        className="px-3.5 sm:px-4 pb-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] space-y-3"
      >
        {/* Room, Episode & Financial Chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
          {appt.roomOrBed && (
            <span className="px-2.5 py-0.5 rounded-lg bg-surface font-semibold text-foreground">
              {appt.roomOrBed}
            </span>
          )}
          {(brief.activeEpisode?.data.title || appt.episodeTitle) && (
            <span className="truncate max-w-full font-medium">
              <bdi dir="auto">
                {brief.activeEpisode?.data.title || appt.episodeTitle}
              </bdi>
            </span>
          )}
          {activePkg && (
            <span className="px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary font-bold tabular-nums">
              <bdi dir="ltr">
                {activePkg.packageUsedSessions ?? 0}/{activePkg.packageTotalSessions}
              </bdi>{' '}
              {bi('جلسات', 'sessions', 'دانیشتن')}
            </span>
          )}
          {totalDebtIQD > 0 && (
            <span className="text-orange-600 dark:text-orange-400 font-extrabold inline-flex items-center gap-1 tabular-nums">
              <Wallet className="size-3.5 shrink-0" />
              <span>{bi('ذمة:', 'Due:', 'ماوە:')}</span>
              <Money amount={totalDebtIQD} />
            </span>
          )}
        </div>

        {/* High-Signal Red Flag / Precaution Text (Color-coded text only, zero colored boxes) */}
        {alertLines.length > 0 && (
          <div className="space-y-1.5 py-0.5 text-xs">
            {alertLines.slice(0, 3).map((al) => (
              <div
                key={`${al.tone}:${al.label}:${al.text}`}
                className={`flex items-start gap-1.5 ${
                  al.tone === 'danger'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug line-clamp-2">
                  <strong className="font-extrabold">{al.label}</strong> {al.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Concise Pre-Session Clinical Brief (Last SOAP / Next Plan) */}
        <div className="p-2.5 rounded-xl bg-surface/80 space-y-1.5 text-xs">
          {brief.loading ? (
            <div className="text-muted-foreground-1 font-medium">
              {bi('جاري تحضير ملخص الجلسة...', 'Loading brief...', 'ئامادەکردنی پوختە...')}
            </div>
          ) : soap ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-muted-foreground-1">
                <span className="font-bold text-foreground">
                  {bi('ملخص آخر جلسة', 'Last Session Brief', 'پوختەی دوایین دانیشتن')}
                  {brief.latestSoapSessionNumber ? ` #${brief.latestSoapSessionNumber}` : ''}
                </span>
                {(prePain !== undefined || postPain !== undefined) && (
                  <span dir="ltr" className="font-mono font-bold text-primary tabular-nums">
                    NPRS: {prePain ?? '—'} → {postPain ?? '—'}
                  </span>
                )}
              </div>
              {soapNextPlan ? (
                <p className="text-foreground leading-snug line-clamp-2">
                  <strong className="text-primary font-extrabold">
                    {bi('خطة اليوم:', "Today's Plan:", 'پلانی ئەمڕۆ:')}{' '}
                  </strong>
                  {soapNextPlan}
                </p>
              ) : (
                (soapImpression || soapComplaint) && (
                  <p className="text-foreground/90 leading-snug line-clamp-2">
                    {soapImpression || soapComplaint}
                  </p>
                )
              )}
            </>
          ) : (
            <div className="text-muted-foreground-1">
              {brief.activeEpisode?.data.medicalDiagnosis ? (
                <span className="text-foreground/90 line-clamp-2">
                  <strong className="font-bold">{bi('التشخيص:', 'Dx:', 'دەستنیشان:')} </strong>
                  {brief.activeEpisode.data.medicalDiagnosis}
                </span>
              ) : (
                bi(
                  'مراجعة سريعة: لا توجد ملاحظات SOAP سابقة لهذه الحلقة بعد.',
                  'Quick brief: No previous SOAP note in this episode yet.',
                  'پوختەی خێرا: هێشتا تێبینیی SOAP تۆمار نەکراوە.'
                )
              )}
            </div>
          )}
        </div>

        {/* Mobile Touch Actions (>= 44px height) */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {effectivePatient && (
            <button
              type="button"
              data-testid="today-start-next-btn"
              disabled={isBusy}
              onClick={onStartSession}
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Play className="size-3.5 fill-current" />
              <span>{primaryActionLabel}</span>
            </button>
          )}

          {appt.status === 'scheduled' && (
            <button
              type="button"
              onClick={onMarkArrived}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-surface hover:bg-layer-hover text-amber-800 dark:text-amber-300 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <UserCheck className="size-4" />
              <span>{bi('وصل', 'Arrived', 'گەیشت')}</span>
            </button>
          )}

          {appt.status !== 'completed' && effectivePatient && (
            <button
              type="button"
              data-testid="today-toss-next-btn"
              onClick={onCompleteAdvance}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/18 text-primary text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-4" />
              <span>{bi('إنهاء', 'Done', 'تەواو')}</span>
            </button>
          )}

          {effectivePatient && (
            <button
              type="button"
              onClick={onOpenChart}
              aria-label={bi('فتح الملف السريري', 'Open Chart', 'کردنەوەی دۆسیە')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <FolderOpen className="size-4 text-primary" />
              <span>{bi('الملف', 'Chart', 'دۆسیە')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // VARIANT B: DESKTOP PRE-SESSION BRIEF CARD (Split-Pane Inspector)
  // -------------------------------------------------------------------
  return (
    <div
      data-testid="today-prebrief-panel"
      className="pr-surface rounded-[24px] p-5 space-y-4"
    >
      {/* 1. Patient Identity & Live Visit Metadata */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-12 rounded-2xl bg-primary/12 text-primary font-extrabold text-lg flex items-center justify-center shrink-0">
            {displayName.trim().charAt(0) || 'م'}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!effectivePatient}
                onClick={onOpenChart}
                className={`text-base font-extrabold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1 cursor-pointer text-start ${
                  privacyBlur ? 'blur-xs select-none' : ''
                }`}
              >
                <span className="truncate">{displayName}</span>
                <ArrowOpenIcon className="size-3.5 text-muted-foreground-2 shrink-0" />
              </button>
              {statusPill}
              {isDemo && <DemoBadge />}
              {reEvalDue && (
                <span
                  data-testid="today-reeval-due-badge"
                  className="text-amber-700 dark:text-amber-300 text-xs font-extrabold inline-flex items-center gap-1"
                >
                  <CalendarClock className="size-3.5" />
                  <span>{bi('إعادة تقييم', 'Re-eval due', 'هەڵسەنگاندنەوە')}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground-1">
              {mrn && (
                <bdi dir="ltr" className="font-mono font-semibold text-foreground/80">
                  {mrn}
                </bdi>
              )}
              {pData && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {pData.gender === 'male'
                      ? bi('ذكر', 'Male', 'نێر')
                      : bi('أنثى', 'Female', 'مێ')}
                    {age !== undefined && ` (${age})`}
                  </span>
                </>
              )}
              {phone && (
                <>
                  <span aria-hidden="true">·</span>
                  <bdi dir="ltr" className="font-mono">
                    {formatIraqiPhoneDisplay(phone)}
                  </bdi>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-end shrink-0 space-y-0.5">
          <TimeDisplay time={appt.startTime} className="text-sm font-extrabold text-primary justify-end" />
          <div className="text-xs text-muted-foreground-1 font-medium">
            <Num value={appt.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')}
            {appt.roomOrBed ? ` · ${appt.roomOrBed}` : ''}
          </div>
        </div>
      </div>

      {/* 2. Clinical Episode, Package Progress & Debt Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(brief.activeEpisode?.data.title || appt.episodeTitle) && (
          <span className="px-2.5 py-1 rounded-xl bg-surface text-foreground font-bold">
            <bdi dir="auto">
              {brief.activeEpisode?.data.title || appt.episodeTitle}
            </bdi>
          </span>
        )}
        {brief.sessionsCount > 0 && (
          <span className="px-2.5 py-1 rounded-xl bg-surface text-muted-foreground-1 font-semibold tabular-nums">
            <Num value={brief.sessionsCount} /> {bi('جلسة مسجلة', 'sessions logged', 'دانیشتنی تۆمارکراو')}
          </span>
        )}
        {activePkg && (
          <span className="px-2.5 py-1 rounded-xl bg-primary/10 text-primary font-extrabold tabular-nums">
            {bi('الكورس:', 'Package:', 'کۆرس:')}{' '}
            <bdi dir="ltr">
              {activePkg.packageUsedSessions ?? 0}/{activePkg.packageTotalSessions}
            </bdi>
          </span>
        )}
        {totalDebtIQD > 0 && (
          <span className="text-orange-600 dark:text-orange-400 font-extrabold inline-flex items-center gap-1 tabular-nums">
            <Wallet className="size-3.5 shrink-0" />
            <span>{bi('ذمة:', 'Due:', 'ماوە:')}</span>
            <Money amount={totalDebtIQD} />
          </span>
        )}
      </div>

      {/* 3. Safety & Red Flags Strip (Color-coded text only, zero colored boxes) */}
      {alertLines.length > 0 && (
        <div className="space-y-1.5 py-0.5">
          {alertLines.map((al) => (
            <div
              key={`${al.tone}:${al.label}:${al.text}`}
              className={`flex items-start gap-2 text-xs ${
                al.tone === 'danger'
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                <strong className="font-extrabold">{al.label}</strong> {al.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 4. Pre-Session Clinical Context: Latest SOAP & Today's Plan */}
      <div className="p-3.5 rounded-2xl bg-surface/75 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-foreground inline-flex items-center gap-1.5">
            <ClipboardList className="size-3.5 text-primary" />
            <span>
              {bi('التحضير السريري قبل الدخول', 'Pre-Session Clinical Brief', 'ئامادەکاری کلینیکی پێش دانیشتن')}
            </span>
          </span>
          {soap && (
            <span className="text-muted-foreground-1 font-medium tabular-nums">
              {brief.latestSoapSessionNumber
                ? bi(`جلسة #${brief.latestSoapSessionNumber}`, `Session #${brief.latestSoapSessionNumber}`)
                : ''}
              {brief.latestSoapSessionDate && (
                <>
                  {' · '}
                  <bdi dir="ltr" className="font-mono">
                    {formatDateDDMMYYYY(brief.latestSoapSessionDate)}
                  </bdi>
                </>
              )}
            </span>
          )}
        </div>

        {brief.loading ? (
          <p className="text-xs text-muted-foreground-1 py-2">
            {bi('جاري فك تشفير وتلخيص آخر جلسة...', 'Decrypting latest clinical brief...', 'خوێندنەوەی دوایین تۆمار...')}
          </p>
        ) : soap ? (
          <div className="space-y-2 text-xs">
            {/* Pain & Quick Objective Counters */}
            {(prePain !== undefined || postPain !== undefined || soapExercisesCount > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {(prePain !== undefined || postPain !== undefined) && (
                  <span className="px-2 py-0.5 rounded-lg bg-card shadow-2xs font-bold text-foreground tabular-nums">
                    {bi('الألم (NPRS):', 'Pain (NPRS):', 'ئازار:')}{' '}
                    <bdi dir="ltr" className="font-mono text-primary">
                      {prePain ?? '—'}/10 → {postPain ?? '—'}/10
                    </bdi>
                  </span>
                )}
                {soapExercisesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-card shadow-2xs font-semibold text-muted-foreground-1">
                    <Num value={soapExercisesCount} /> {bi('تمارين منفذة', 'exercises logged', 'ڕاهێنان')}
                  </span>
                )}
              </div>
            )}

            {/* Highlighted Next Session Plan (what the therapist planned for TODAY) */}
            {soapNextPlan && (
              <div className="p-2.5 rounded-xl bg-primary/[0.07] border-s-2 border-s-primary">
                <span className="block text-xs font-extrabold text-primary mb-0.5">
                  {bi('خطة هذه الجلسة (من الجلسة السابقة):', "Today's Planned Focus:", 'پلانی ئەم دانیشتنە:')}
                </span>
                <p className="text-foreground leading-relaxed line-clamp-2">{soapNextPlan}</p>
              </div>
            )}

            {(soapComplaint || soapImpression || soapInterventions) && (
              <div className="space-y-1 text-muted-foreground-1 leading-relaxed">
                {soapComplaint && (
                  <p className="line-clamp-2">
                    <strong className="text-foreground font-bold">{bi('الشكوى:', 'Complaint:', 'سکاڵا:')} </strong>
                    {soapComplaint}
                  </p>
                )}
                {(soapInterventions || soapImpression) && (
                  <p className="line-clamp-2">
                    <strong className="text-foreground font-bold">
                      {soapInterventions
                        ? bi('التدخلات:', 'Interventions:', 'چارەسەر:')
                        : bi('التقييم:', 'Assessment:', 'هەڵسەنگاندن:')}{' '}
                    </strong>
                    {soapInterventions || soapImpression}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 text-xs text-muted-foreground-1">
            {brief.activeEpisode?.data.medicalDiagnosis ? (
              <p className="text-foreground leading-relaxed">
                <strong className="font-bold">{bi('التشخيص المبدئي:', 'Diagnosis:', 'دەستنیشان:')}{' '}</strong>
                {brief.activeEpisode.data.medicalDiagnosis}
              </p>
            ) : pData?.medicalHistory ? (
              <p className="text-foreground leading-relaxed line-clamp-2">
                <strong className="font-bold">{bi('التاريخ المرضي:', 'History:', 'مێژووی نەخۆشی:')}{' '}</strong>
                {pData.medicalHistory}
              </p>
            ) : (
              <p>
                {bi(
                  'مريض جديد أو أول جلسة في هذه الحلقة — جاهز لبدء التقييم والتوثيق مباشرة.',
                  'First session in this episode — ready to evaluate and document.',
                  'یەکەم دانیشتن لەم قۆناغەدا — ئامادەیە بۆ هەڵسەنگاندن و تۆمارکردن.'
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 5. Focused Action Dock (ONE Primary Solid Green CTA) */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="today-start-next-btn"
            disabled={isBusy || !effectivePatient}
            onClick={onStartSession}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Play className="size-3.5 fill-current" />
            <span>{primaryActionLabel}</span>
          </button>

          {appt.status === 'scheduled' && (
            <button
              type="button"
              onClick={onMarkArrived}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-surface hover:bg-layer-hover text-amber-800 dark:text-amber-300 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <UserCheck className="size-3.5" />
              <span>{bi('تأكيد الوصول', 'Arrived', 'گەیشت')}</span>
            </button>
          )}

          {appt.status !== 'completed' && (
            <button
              type="button"
              data-testid="today-toss-next-btn"
              onClick={onCompleteAdvance}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/18 text-primary text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="size-4" />
              <span>{bi('إنهاء / التالي', 'Done / Next', 'تەواو / داهاتوو')}</span>
            </button>
          )}

          {appt.status !== 'completed' && effectivePatient && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onFinishAndCollect}
              className="min-h-[40px] px-3 py-2 rounded-xl hover:bg-surface text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              <span>{bi('إنهاء وتحصيل', 'Finish & Collect', 'تەواوکردن و وەرگرتن')}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {canSkipToNext && (
            <button
              type="button"
              onClick={onSkipToNext}
              title={bi('الانتقال للمريض التالي', 'Skip to next patient', 'چوون بۆ نەخۆشی دواتر')}
              aria-label={bi('الانتقال للمريض التالي', 'Skip to next patient', 'چوون بۆ نەخۆشی دواتر')}
              className="size-10 rounded-xl bg-surface hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer transition-colors"
            >
              <SkipForward className="size-4" />
            </button>
          )}
          {effectivePatient && (
            <button
              type="button"
              onClick={onOpenChart}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FolderOpen className="size-3.5 text-primary" />
              <span>{bi('فتح الملف', 'Full Chart', 'دۆسیەی تەواو')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
